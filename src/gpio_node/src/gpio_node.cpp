#include "gpio_node/gpio_node.hpp"

#include <algorithm>
#include <chrono>
#include <sstream>
#include <stdexcept>

GpioNode::GpioNode()
: Node("gpio_node")
{
  // Declare ROS2 parameters — same defaults as the Python version
  this->declare_parameter("output_pins", std::vector<int64_t>{17, 27, 22});
  this->declare_parameter("input_pins", std::vector<int64_t>{5, 6, 13});
  this->declare_parameter("input_publish_rate", 10.0);
  this->declare_parameter("gpio_chip", std::string("/dev/gpiochip0"));

  output_pins_ = this->get_parameter("output_pins").as_integer_array();
  input_pins_ = this->get_parameter("input_pins").as_integer_array();
  double rate = this->get_parameter("input_publish_rate").as_double();
  std::string chip_path = this->get_parameter("gpio_chip").as_string();

  // Setup GPIO hardware — no simulation fallback, will throw on failure
  setup_gpio(chip_path);

  // Subscribe to /gpio/write from executor
  write_sub_ = this->create_subscription<blockly_interfaces::msg::GpioWrite>(
    "/gpio/write", 10,
    std::bind(&GpioNode::write_callback, this, std::placeholders::_1));

  // Publisher for /gpio/state to executor
  state_pub_ = this->create_publisher<blockly_interfaces::msg::GpioRead>(
    "/gpio/state", 10);

  // Polling timer for input pins
  if (!input_pins_.empty()) {
    auto period = std::chrono::duration<double>(1.0 / rate);
    read_timer_ = this->create_wall_timer(
      std::chrono::duration_cast<std::chrono::milliseconds>(period),
      std::bind(&GpioNode::read_callback, this));
  }

  // Log ready status
  std::ostringstream oss;
  oss << "GpioNode ready — outputs=[";
  for (size_t i = 0; i < output_pins_.size(); ++i) {
    if (i > 0) oss << ",";
    oss << output_pins_[i];
  }
  oss << "], inputs=[";
  for (size_t i = 0; i < input_pins_.size(); ++i) {
    if (i > 0) oss << ",";
    oss << input_pins_[i];
  }
  oss << "]";
  RCLCPP_INFO(this->get_logger(), "%s", oss.str().c_str());
}

GpioNode::~GpioNode()
{
  if (output_request_) {
    gpiod_line_request_release(output_request_);
    output_request_ = nullptr;
  }
  if (input_request_) {
    gpiod_line_request_release(input_request_);
    input_request_ = nullptr;
  }
  RCLCPP_INFO(this->get_logger(), "GPIO lines released");
}

void GpioNode::setup_gpio(const std::string & chip_path)
{
  struct gpiod_chip * chip = gpiod_chip_open(chip_path.c_str());
  if (!chip) {
    throw std::runtime_error("Failed to open GPIO chip: " + chip_path);
  }

  // Request output lines as a single batch
  if (!output_pins_.empty()) {
    struct gpiod_line_settings * settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_OUTPUT);

    struct gpiod_line_config * line_cfg = gpiod_line_config_new();
    for (auto pin : output_pins_) {
      unsigned int offset = static_cast<unsigned int>(pin);
      gpiod_line_config_add_line_settings(line_cfg, &offset, 1, settings);
      RCLCPP_INFO(this->get_logger(), "Configured pin %ld as OUTPUT", pin);
    }

    struct gpiod_request_config * req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "gpio_node");

    output_request_ = gpiod_chip_request_lines(chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!output_request_) {
      gpiod_chip_close(chip);
      throw std::runtime_error("Failed to request output lines");
    }
  }

  // Request input lines as a single batch
  if (!input_pins_.empty()) {
    struct gpiod_line_settings * settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_INPUT);

    struct gpiod_line_config * line_cfg = gpiod_line_config_new();
    for (auto pin : input_pins_) {
      unsigned int offset = static_cast<unsigned int>(pin);
      gpiod_line_config_add_line_settings(line_cfg, &offset, 1, settings);
      RCLCPP_INFO(this->get_logger(), "Configured pin %ld as INPUT", pin);
    }

    struct gpiod_request_config * req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "gpio_node");

    input_request_ = gpiod_chip_request_lines(chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!input_request_) {
      gpiod_chip_close(chip);
      throw std::runtime_error("Failed to request input lines");
    }
  }

  gpiod_chip_close(chip);
}

void GpioNode::write_callback(
  const blockly_interfaces::msg::GpioWrite::SharedPtr msg)
{
  int pin = static_cast<int>(msg->pin);
  bool state = msg->state;

  // Check if pin is configured as output
  if (std::find(output_pins_.begin(), output_pins_.end(), pin) ==
    output_pins_.end())
  {
    RCLCPP_WARN(
      this->get_logger(),
      "Pin %d not configured as output — ignoring write", pin);
    return;
  }

  if (output_request_) {
    enum gpiod_line_value value =
      state ? GPIOD_LINE_VALUE_ACTIVE : GPIOD_LINE_VALUE_INACTIVE;
    gpiod_line_request_set_value(
      output_request_, static_cast<unsigned int>(pin), value);
  }

  RCLCPP_INFO(
    this->get_logger(),
    "GPIO write: pin=%d state=%s", pin, state ? "HIGH" : "LOW");
}

void GpioNode::read_callback()
{
  for (auto pin : input_pins_) {
    auto msg = blockly_interfaces::msg::GpioRead();
    msg.pin = static_cast<uint8_t>(pin);

    if (input_request_) {
      enum gpiod_line_value value =
        gpiod_line_request_get_value(
          input_request_, static_cast<unsigned int>(pin));
      msg.state = (value == GPIOD_LINE_VALUE_ACTIVE);
    }

    state_pub_->publish(msg);
  }
}
