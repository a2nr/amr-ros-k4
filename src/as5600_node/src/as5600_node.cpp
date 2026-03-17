#include "as5600_node/as5600_node.hpp"

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>

#include <chrono>
#include <stdexcept>

As5600Node::As5600Node()
: Node("as5600_node"),
  first_reading_(true),
  pose_x_(0.0),
  pose_y_(0.0),
  pose_theta_(0.0)
{
  // Declare ROS2 parameters
  this->declare_parameter("i2c_devices", std::vector<std::string>{"/dev/i2c-1"});
  this->declare_parameter("publish_rate", 10.0);
  // Kiwi wheel geometry (units: cm, rad)
  this->declare_parameter("wheel_radius", 5.0);       // cm — MUST tune to actual hardware
  this->declare_parameter("wheel_distance", 15.0);     // cm — MUST tune to actual hardware
  this->declare_parameter("wheel_angles",              // rad — wheel position angles
    std::vector<double>{0.0, 2.094395102393195, 4.188790204786391});  // 0°, 120°, 240°

  auto device_paths = this->get_parameter("i2c_devices").as_string_array();
  double rate = this->get_parameter("publish_rate").as_double();
  wheel_radius_ = this->get_parameter("wheel_radius").as_double();
  wheel_distance_ = this->get_parameter("wheel_distance").as_double();
  wheel_angles_ = this->get_parameter("wheel_angles").as_double_array();
  dt_ = 1.0 / rate;

  // Open all I2C buses
  open_i2c_buses(device_paths);

  // Initialize velocity computation state
  prev_angle_rad_.resize(i2c_fds_.size(), 0.0);

  // Create odometry publisher on odometry_encoder/odom (nav_msgs/Odometry)
  odom_pub_ = this->create_publisher<nav_msgs::msg::Odometry>(
    "odometry_encoder/odom", 10);

  // Create timer for periodic reads
  auto period = std::chrono::duration<double>(1.0 / rate);
  read_timer_ = this->create_wall_timer(
    std::chrono::duration_cast<std::chrono::nanoseconds>(period),
    std::bind(&As5600Node::timer_callback, this));

  RCLCPP_INFO(
    this->get_logger(),
    "As5600Node ready — %zu encoder(s), rate=%.1f Hz, r=%.1f cm, L=%.1f cm",
    i2c_fds_.size(), rate, wheel_radius_, wheel_distance_);
}

As5600Node::~As5600Node()
{
  for (int fd : i2c_fds_) {
    if (fd >= 0) {
      close(fd);
    }
  }
  RCLCPP_INFO(this->get_logger(), "I2C devices closed");
}

void As5600Node::open_i2c_buses(const std::vector<std::string> & device_paths)
{
  for (size_t i = 0; i < device_paths.size(); ++i) {
    int fd = open(device_paths[i].c_str(), O_RDWR);
    if (fd < 0) {
      throw std::runtime_error(
        "Failed to open I2C device: " + device_paths[i]);
    }

    // Set slave address once — each fd is dedicated to one AS5600
    if (ioctl(fd, I2C_SLAVE, AS5600_ADDR) < 0) {
      close(fd);
      throw std::runtime_error(
        "Failed to set I2C slave address 0x36 on " + device_paths[i]);
    }

    i2c_fds_.push_back(fd);
    RCLCPP_INFO(
      this->get_logger(),
      "Encoder %zu opened on %s (addr=0x%02X)",
      i, device_paths[i].c_str(), AS5600_ADDR);
  }
}

uint16_t As5600Node::read_raw_angle(int fd)
{
  // AS5600 RAW_ANGLE register: 0x0C (high byte) + 0x0D (low byte)
  // Write register address, then read 2 bytes
  uint8_t reg = REG_RAW_ANGLE_H;
  if (write(fd, &reg, 1) != 1) {
    RCLCPP_ERROR(this->get_logger(), "I2C register select failed");
    return 0;
  }

  uint8_t buf[2] = {0, 0};
  if (read(fd, buf, 2) != 2) {
    RCLCPP_ERROR(this->get_logger(), "I2C read failed");
    return 0;
  }

  // 12-bit value: high nibble of buf[0] + full buf[1]
  return ((buf[0] & 0x0F) << 8) | buf[1];
}

uint8_t As5600Node::read_status(int fd)
{
  uint8_t reg = REG_STATUS;
  if (write(fd, &reg, 1) != 1) {
    RCLCPP_ERROR(this->get_logger(), "I2C status register select failed");
    return 0;
  }

  uint8_t status = 0;
  if (read(fd, &status, 1) != 1) {
    RCLCPP_ERROR(this->get_logger(), "I2C status read failed");
    return 0;
  }
  return status;
}

void As5600Node::timer_callback()
{
  // 1. Read all encoder angles and compute wheel angular velocities
  size_t n = std::min(i2c_fds_.size(), wheel_angles_.size());
  std::vector<double> wheel_velocities(n, 0.0);

  for (size_t i = 0; i < i2c_fds_.size(); ++i) {
    uint16_t raw = read_raw_angle(i2c_fds_[i]);
    double angle_rad = static_cast<double>(raw) * 2.0 * M_PI / 4096.0;

    // Compute wheel angular velocity (handle 0↔2π wraparound)
    if (!first_reading_ && i < n) {
      double delta = angle_rad - prev_angle_rad_[i];
      if (delta > M_PI) delta -= 2.0 * M_PI;
      if (delta < -M_PI) delta += 2.0 * M_PI;
      wheel_velocities[i] = delta / dt_;
    }
    prev_angle_rad_[i] = angle_rad;
  }

  if (first_reading_) {
    first_reading_ = false;
    return;
  }

  // 2. Kiwi wheel forward kinematics → robot velocity (cm/s, rad/s)
  //    Constraint: ωᵢ = (1/r)(-vx·sin(αᵢ) + vy·cos(αᵢ) + L·ωz)
  //    Forward: [vx, vy, ωz] = J⁻¹ · [ω₀, ω₁, ω₂]
  double vx = 0.0, vy = 0.0, wz = 0.0;
  for (size_t i = 0; i < n; ++i) {
    vx += -wheel_velocities[i] * sin(wheel_angles_[i]);
    vy +=  wheel_velocities[i] * cos(wheel_angles_[i]);
    wz +=  wheel_velocities[i];
  }
  double dn = static_cast<double>(n);
  vx *= wheel_radius_ / dn;           // cm/s
  vy *= wheel_radius_ / dn;           // cm/s
  wz *= wheel_radius_ / (dn * wheel_distance_);  // rad/s

  // 3. Integrate pose in world frame (Euler integration)
  pose_x_ += (vx * cos(pose_theta_) - vy * sin(pose_theta_)) * dt_;
  pose_y_ += (vx * sin(pose_theta_) + vy * cos(pose_theta_)) * dt_;
  pose_theta_ += wz * dt_;

  // 4. Publish nav_msgs/Odometry on odometry_encoder/odom
  nav_msgs::msg::Odometry odom;
  odom.header.stamp = this->now();
  odom.header.frame_id = "odom";
  odom.child_frame_id = "base_link";

  // Position (cm)
  odom.pose.pose.position.x = pose_x_;
  odom.pose.pose.position.y = pose_y_;
  odom.pose.pose.position.z = 0.0;

  // Orientation — quaternion from yaw (2D: q = [0, 0, sin(θ/2), cos(θ/2)])
  odom.pose.pose.orientation.x = 0.0;
  odom.pose.pose.orientation.y = 0.0;
  odom.pose.pose.orientation.z = sin(pose_theta_ / 2.0);
  odom.pose.pose.orientation.w = cos(pose_theta_ / 2.0);

  // Twist — body frame velocity (cm/s, rad/s)
  odom.twist.twist.linear.x = vx;
  odom.twist.twist.linear.y = vy;
  odom.twist.twist.linear.z = 0.0;
  odom.twist.twist.angular.x = 0.0;
  odom.twist.twist.angular.y = 0.0;
  odom.twist.twist.angular.z = wz;

  odom_pub_->publish(odom);
}
