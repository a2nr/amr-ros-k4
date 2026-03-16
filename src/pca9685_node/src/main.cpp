#include <rclcpp/rclcpp.hpp>
#include "pca9685_node/pca9685_node.hpp"

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  auto node = std::make_shared<Pca9685Node>();
  rclcpp::spin(node);
  rclcpp::shutdown();
  return 0;
}
