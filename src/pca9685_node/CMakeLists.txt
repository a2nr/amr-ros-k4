cmake_minimum_required(VERSION 3.10)
project(pca9685_node)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ROS2 dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(blockly_interfaces REQUIRED)

add_executable(pca9685_node
  src/main.cpp
  src/pca9685_node.cpp
)

target_include_directories(pca9685_node PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)

ament_target_dependencies(pca9685_node
  rclcpp
  blockly_interfaces
)

install(TARGETS pca9685_node
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
