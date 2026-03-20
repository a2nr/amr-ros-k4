"""Launch blockly_executor (real hardware mode) + blockly_app in one command.

Pi hardware nodes (gpio_node, pca9685_node, as5600_node) must already be
running on the Raspberry Pi on the same ROS2 network (same ROS_DOMAIN_ID).

When blockly_app window is closed, the entire launch is shut down.
"""

from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import ExecuteProcess, RegisterEventHandler, Shutdown
from launch.event_handlers import OnProcessExit


def generate_launch_description():
    executor_node = Node(
        package='blockly_executor',
        executable='executor_node',
        name='blockly_executor_node',
        parameters=[{'hardware_mode': 'real'}],
        output='screen',
        emulate_tty=True,
    )

    blockly_app = ExecuteProcess(
        cmd=['python', '-m', 'blockly_app.app'],
        output='screen',
    )

    return LaunchDescription([
        executor_node,
        blockly_app,
        # When blockly_app is closed, shut down everything
        RegisterEventHandler(OnProcessExit(
            target_action=blockly_app,
            on_exit=[Shutdown(reason='blockly_app closed')],
        )),
    ])
