cmake_minimum_required(VERSION 3.10)
project(gpio_node)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ROS2 dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(blockly_interfaces REQUIRED)

# libgpiod C++ bindings (via pkg-config)
find_package(PkgConfig REQUIRED)
pkg_check_modules(GPIOD REQUIRED libgpiodcxx)

add_executable(gpio_node
  src/main.cpp
  src/gpio_node.cpp
)

target_include_directories(gpio_node PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
  ${GPIOD_INCLUDE_DIRS}
)

target_link_libraries(gpio_node ${GPIOD_LIBRARIES})

ament_target_dependencies(gpio_node
  rclcpp
  blockly_interfaces
)

install(TARGETS gpio_node
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
