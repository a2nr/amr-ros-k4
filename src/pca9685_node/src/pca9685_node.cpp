#include "pca9685_node/pca9685_node.hpp"

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>

#include <cmath>
#include <chrono>
#include <stdexcept>
#include <thread>

Pca9685Node::Pca9685Node()
: Node("pca9685_node")
{
  // Declare ROS2 parameters
  this->declare_parameter("i2c_device", std::string("/dev/i2c-1"));
  this->declare_parameter("frequency", 50);

  std::string device_path = this->get_parameter("i2c_device").as_string();
  int frequency = static_cast<int>(this->get_parameter("frequency").as_int());

  // Open I2C device
  open_i2c(device_path);

  // Configure PWM frequency on default address (0x40)
  configure_frequency(frequency);

  // Subscribe to /pwm/write from executor
  write_sub_ = this->create_subscription<blockly_interfaces::msg::PwmWrite>(
    "/pwm/write", 10,
    std::bind(&Pca9685Node::write_callback, this, std::placeholders::_1));

  RCLCPP_INFO(
    this->get_logger(),
    "Pca9685Node ready — device=%s, frequency=%d Hz",
    device_path.c_str(), frequency);
}

Pca9685Node::~Pca9685Node()
{
  if (i2c_fd_ >= 0) {
    close(i2c_fd_);
    i2c_fd_ = -1;
  }
  RCLCPP_INFO(this->get_logger(), "I2C device closed");
}

void Pca9685Node::open_i2c(const std::string & device_path)
{
  i2c_fd_ = open(device_path.c_str(), O_RDWR);
  if (i2c_fd_ < 0) {
    throw std::runtime_error("Failed to open I2C device: " + device_path);
  }
}

void Pca9685Node::configure_frequency(int frequency)
{
  // PCA9685 prescale formula: prescale = round(25MHz / (4096 * freq)) - 1
  int prescale = static_cast<int>(std::round(25000000.0 / (4096.0 * frequency))) - 1;
  if (prescale < 3) prescale = 3;      // min prescale (max ~1526 Hz)
  if (prescale > 255) prescale = 255;  // max prescale (min ~24 Hz)

  uint8_t address = 0x40;  // default PCA9685 address

  // Read current MODE1
  uint8_t mode1 = read_register(address, REG_MODE1);

  // Sleep mode (required before changing prescale)
  write_register(address, REG_MODE1, (mode1 & 0x7F) | MODE1_SLEEP);

  // Set prescale
  write_register(address, REG_PRESCALE, static_cast<uint8_t>(prescale));

  // Wake up + enable auto-increment
  write_register(address, REG_MODE1, (mode1 & 0x7F) | MODE1_AI);

  // Wait for oscillator (500µs per datasheet)
  std::this_thread::sleep_for(std::chrono::microseconds(500));

  // Restart
  write_register(address, REG_MODE1, mode1 | MODE1_RESTART | MODE1_AI);

  RCLCPP_INFO(
    this->get_logger(),
    "PCA9685 (0x%02X) frequency configured: %d Hz (prescale=%d)",
    address, frequency, prescale);
}

void Pca9685Node::write_callback(
  const blockly_interfaces::msg::PwmWrite::SharedPtr msg)
{
  uint8_t address = msg->address;
  uint8_t channel = msg->channel;
  uint16_t value = msg->value;

  if (channel > 15) {
    RCLCPP_WARN(this->get_logger(), "Invalid channel %d (must be 0-15)", channel);
    return;
  }

  if (value > 4095) {
    value = 4095;
  }

  set_pwm(address, channel, value);

  RCLCPP_INFO(
    this->get_logger(),
    "PWM write: addr=0x%02X ch=%d value=%d",
    address, channel, value);
}

void Pca9685Node::set_pwm(uint8_t address, uint8_t channel, uint16_t value)
{
  // Each channel has 4 registers: ON_L, ON_H, OFF_L, OFF_H
  // For simple duty cycle: ON=0, OFF=value
  uint8_t reg_base = REG_LED0_ON_L + 4 * channel;

  // Select I2C slave address
  if (ioctl(i2c_fd_, I2C_SLAVE, address) < 0) {
    RCLCPP_ERROR(
      this->get_logger(),
      "Failed to select I2C address 0x%02X", address);
    return;
  }

  // Write 4 bytes: ON_L, ON_H, OFF_L, OFF_H (auto-increment enabled)
  uint8_t buf[5];
  buf[0] = reg_base;              // starting register
  buf[1] = 0;                     // ON_L  = 0
  buf[2] = 0;                     // ON_H  = 0
  buf[3] = value & 0xFF;          // OFF_L = low byte
  buf[4] = (value >> 8) & 0x0F;   // OFF_H = high nibble

  if (write(i2c_fd_, buf, 5) != 5) {
    RCLCPP_ERROR(
      this->get_logger(),
      "I2C write failed for addr=0x%02X ch=%d", address, channel);
  }
}

void Pca9685Node::write_register(uint8_t address, uint8_t reg, uint8_t data)
{
  if (ioctl(i2c_fd_, I2C_SLAVE, address) < 0) {
    RCLCPP_ERROR(
      this->get_logger(),
      "Failed to select I2C address 0x%02X", address);
    return;
  }

  uint8_t buf[2] = {reg, data};
  if (write(i2c_fd_, buf, 2) != 2) {
    RCLCPP_ERROR(
      this->get_logger(),
      "I2C register write failed: addr=0x%02X reg=0x%02X", address, reg);
  }
}

uint8_t Pca9685Node::read_register(uint8_t address, uint8_t reg)
{
  if (ioctl(i2c_fd_, I2C_SLAVE, address) < 0) {
    RCLCPP_ERROR(
      this->get_logger(),
      "Failed to select I2C address 0x%02X", address);
    return 0;
  }

  if (write(i2c_fd_, &reg, 1) != 1) {
    RCLCPP_ERROR(
      this->get_logger(),
      "I2C register select failed: addr=0x%02X reg=0x%02X", address, reg);
    return 0;
  }

  uint8_t data = 0;
  if (read(i2c_fd_, &data, 1) != 1) {
    RCLCPP_ERROR(
      this->get_logger(),
      "I2C register read failed: addr=0x%02X reg=0x%02X", address, reg);
    return 0;
  }

  return data;
}
