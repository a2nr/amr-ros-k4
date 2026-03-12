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
  // gpiod::line_request releases lines automatically when destroyed,
  // but we log it explicitly for visibility.
  if (output_request_) {
    output_request_->release();
    output_request_.reset();
  }
  if (input_request_) {
    input_request_->release();
    input_request_.reset();
  }
  RCLCPP_INFO(this->get_logger(), "GPIO lines released");
}

void GpioNode::setup_gpio(const std::string & chip_path)
{
  gpiod::chip chip(chip_path);

  // Request output lines as a single batch
  if (!output_pins_.empty()) {
    auto out_settings = gpiod::line_settings();
    out_settings.set_direction(gpiod::line::direction::OUTPUT);

    auto out_rb = chip.prepare_request().set_consumer("gpio_node");
    for (auto pin : output_pins_) {
      out_rb.add_line_settings(static_cast<unsigned int>(pin), out_settings);
      RCLCPP_INFO(this->get_logger(), "Configured pin %ld as OUTPUT", pin);
    }
    output_request_ = std::make_unique<gpiod::line_request>(out_rb.do_request());
  }

  // Request input lines as a single batch
  if (!input_pins_.empty()) {
    auto in_settings = gpiod::line_settings();
    in_settings.set_direction(gpiod::line::direction::INPUT);

    auto in_rb = chip.prepare_request().set_consumer("gpio_node");
    for (auto pin : input_pins_) {
      in_rb.add_line_settings(static_cast<unsigned int>(pin), in_settings);
      RCLCPP_INFO(this->get_logger(), "Configured pin %ld as INPUT", pin);
    }
    input_request_ = std::make_unique<gpiod::line_request>(in_rb.do_request());
  }
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
    output_request_->set_value(
      pin,
      state ? gpiod::line::value::ACTIVE : gpiod::line::value::INACTIVE);
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
      msg.state =
        input_request_->get_value(pin) == gpiod::line::value::ACTIVE;
    }

    state_pub_->publish(msg);
  }
}
