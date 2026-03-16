#include "as5600_node/as5600_node.hpp"

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>

#include <chrono>
#include <stdexcept>

As5600Node::As5600Node()
: Node("as5600_node")
{
  // Declare ROS2 parameters
  this->declare_parameter("i2c_devices", std::vector<std::string>{"/dev/i2c-1"});
  this->declare_parameter("publish_rate", 10.0);

  auto device_paths = this->get_parameter("i2c_devices").as_string_array();
  double rate = this->get_parameter("publish_rate").as_double();

  // Open all I2C buses
  open_i2c_buses(device_paths);

  // Create publisher for /encoder/state
  encoder_pub_ = this->create_publisher<blockly_interfaces::msg::EncoderRead>(
    "/encoder/state", 10);

  // Create timer for periodic reads
  auto period = std::chrono::duration<double>(1.0 / rate);
  read_timer_ = this->create_wall_timer(
    std::chrono::duration_cast<std::chrono::nanoseconds>(period),
    std::bind(&As5600Node::timer_callback, this));

  RCLCPP_INFO(
    this->get_logger(),
    "As5600Node ready — %zu encoder(s), publish_rate=%.1f Hz",
    i2c_fds_.size(), rate);
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

void As5600Node::timer_callback()
{
  for (size_t i = 0; i < i2c_fds_.size(); ++i) {
    uint16_t raw = read_raw_angle(i2c_fds_[i]);
    float angle = static_cast<float>(raw) * 360.0f / 4096.0f;

    blockly_interfaces::msg::EncoderRead msg;
    msg.encoder_id = static_cast<uint8_t>(i);
    msg.raw_angle = raw;
    msg.angle = angle;
    encoder_pub_->publish(msg);
  }
}
