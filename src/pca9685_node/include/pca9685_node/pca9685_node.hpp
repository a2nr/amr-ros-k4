#ifndef PCA9685_NODE__PCA9685_NODE_HPP_
#define PCA9685_NODE__PCA9685_NODE_HPP_

#include <string>

#include <rclcpp/rclcpp.hpp>

#include "blockly_interfaces/msg/pwm_write.hpp"

class Pca9685Node : public rclcpp::Node
{
public:
  Pca9685Node();
  ~Pca9685Node() override;

private:
  void open_i2c(const std::string & device_path);
  void configure_frequency(int frequency);
  void write_callback(const blockly_interfaces::msg::PwmWrite::SharedPtr msg);
  void set_pwm(uint8_t address, uint8_t channel, uint16_t value);
  void write_register(uint8_t address, uint8_t reg, uint8_t data);
  uint8_t read_register(uint8_t address, uint8_t reg);

  int i2c_fd_ = -1;

  // PCA9685 register addresses
  static constexpr uint8_t REG_MODE1 = 0x00;
  static constexpr uint8_t REG_PRESCALE = 0xFE;
  static constexpr uint8_t REG_LED0_ON_L = 0x06;

  // MODE1 bits
  static constexpr uint8_t MODE1_SLEEP = 0x10;
  static constexpr uint8_t MODE1_AI = 0x20;      // auto-increment
  static constexpr uint8_t MODE1_RESTART = 0x80;

  rclcpp::Subscription<blockly_interfaces::msg::PwmWrite>::SharedPtr write_sub_;
};

#endif  // PCA9685_NODE__PCA9685_NODE_HPP_
