#include <rclcpp/rclcpp.hpp>
#include "gpio_node/gpio_node.hpp"

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  auto node = std::make_shared<GpioNode>();
  rclcpp::spin(node);
  rclcpp::shutdown();
  return 0;
}
