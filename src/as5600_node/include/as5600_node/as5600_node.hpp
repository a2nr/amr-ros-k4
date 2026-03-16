#ifndef AS5600_NODE__AS5600_NODE_HPP_
#define AS5600_NODE__AS5600_NODE_HPP_

#include <string>
#include <vector>

#include <rclcpp/rclcpp.hpp>

#include "blockly_interfaces/msg/encoder_read.hpp"

class As5600Node : public rclcpp::Node
{
public:
  As5600Node();
  ~As5600Node() override;

private:
  void open_i2c_buses(const std::vector<std::string> & device_paths);
  uint16_t read_raw_angle(int fd);
  void timer_callback();

  std::vector<int> i2c_fds_;

  // AS5600 fixed I2C address
  static constexpr uint8_t AS5600_ADDR = 0x36;

  // AS5600 register addresses
  static constexpr uint8_t REG_RAW_ANGLE_H = 0x0C;
  static constexpr uint8_t REG_STATUS = 0x0B;

  rclcpp::Publisher<blockly_interfaces::msg::EncoderRead>::SharedPtr encoder_pub_;
  rclcpp::TimerBase::SharedPtr read_timer_;
};

#endif  // AS5600_NODE__AS5600_NODE_HPP_
