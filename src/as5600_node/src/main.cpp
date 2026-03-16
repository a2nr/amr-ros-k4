#include <rclcpp/rclcpp.hpp>
#include "as5600_node/as5600_node.hpp"

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  auto node = std::make_shared<As5600Node>();
  rclcpp::spin(node);
  rclcpp::shutdown();
  return 0;
}
