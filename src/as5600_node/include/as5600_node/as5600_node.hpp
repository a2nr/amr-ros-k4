#ifndef AS5600_NODE__AS5600_NODE_HPP_
#define AS5600_NODE__AS5600_NODE_HPP_

#include <cmath>
#include <string>
#include <vector>

#include <rclcpp/rclcpp.hpp>

#include <nav_msgs/msg/odometry.hpp>

class As5600Node : public rclcpp::Node
{
public:
  As5600Node();
  ~As5600Node() override;

private:
  void open_i2c_buses(const std::vector<std::string> & device_paths);
  uint16_t read_raw_angle(int fd);
  uint8_t read_status(int fd);
  void timer_callback();

  std::vector<int> i2c_fds_;

  // AS5600 fixed I2C address
  static constexpr uint8_t AS5600_ADDR = 0x36;

  // AS5600 register addresses
  static constexpr uint8_t REG_RAW_ANGLE_H = 0x0C;
  static constexpr uint8_t REG_STATUS = 0x0B;

  // STATUS register bit masks
  static constexpr uint8_t STATUS_MD = 0x20;  // Magnet Detected

  // Odometry publisher (nav_msgs/Odometry on odometry_encoder/odom)
  rclcpp::Publisher<nav_msgs::msg::Odometry>::SharedPtr odom_pub_;
  rclcpp::TimerBase::SharedPtr read_timer_;

  // Velocity computation state
  std::vector<double> prev_angle_rad_;
  bool first_reading_;
  double dt_;

  // Kiwi wheel kinematics parameters (units: cm, rad)
  double wheel_radius_;                  // cm
  double wheel_distance_;                // cm (center-to-wheel)
  std::vector<double> wheel_angles_;     // rad (position angle of each wheel)

  // Pose integration state (units: cm, rad)
  double pose_x_;
  double pose_y_;
  double pose_theta_;
};

#endif  // AS5600_NODE__AS5600_NODE_HPP_
