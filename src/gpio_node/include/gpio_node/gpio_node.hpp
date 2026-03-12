#ifndef GPIO_NODE__GPIO_NODE_HPP_
#define GPIO_NODE__GPIO_NODE_HPP_

#include <memory>
#include <string>
#include <vector>

#include <gpiod.hpp>
#include <rclcpp/rclcpp.hpp>

#include "blockly_interfaces/msg/gpio_read.hpp"
#include "blockly_interfaces/msg/gpio_write.hpp"

class GpioNode : public rclcpp::Node
{
public:
  GpioNode();
  ~GpioNode() override;

private:
  void setup_gpio(const std::string & chip_path);
  void write_callback(const blockly_interfaces::msg::GpioWrite::SharedPtr msg);
  void read_callback();

  std::vector<int64_t> output_pins_;
  std::vector<int64_t> input_pins_;

  // gpiod v2.x line requests — one per direction group
  std::unique_ptr<gpiod::line_request> output_request_;
  std::unique_ptr<gpiod::line_request> input_request_;

  rclcpp::Subscription<blockly_interfaces::msg::GpioWrite>::SharedPtr write_sub_;
  rclcpp::Publisher<blockly_interfaces::msg::GpioRead>::SharedPtr state_pub_;
  rclcpp::TimerBase::SharedPtr read_timer_;
};

#endif  // GPIO_NODE__GPIO_NODE_HPP_
