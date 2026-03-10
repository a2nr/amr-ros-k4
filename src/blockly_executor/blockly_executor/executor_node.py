"""ROS2 Action Server node for executing Blockly commands."""

import rclpy
from rclpy.action import ActionServer, GoalResponse, CancelResponse
from rclpy.action.server import ServerGoalHandle
from rclpy.node import Node

from .handlers import HandlerRegistry
from .handlers.hardware import Hardware
from .utils import parse_params

# Import will work after colcon build of interfaces package.
# The interfaces package must be built and sourced first.
from blockly_interfaces.action import BlocklyAction


class ExecutorNode(Node):
    """
    ROS2 Action Server that receives BlocklyAction goals and executes them
    one at a time using the HandlerRegistry.

    The node does not understand program flow — it only handles individual
    commands. Program sequencing is entirely controlled by Blockly.
    """

    def __init__(self) -> None:
        super().__init__("blockly_executor_node")

        hardware_mode = self.declare_parameter("hardware_mode", "dummy").value
        use_real = self.declare_parameter("use_real_hardware", False).value

        # Backward compat: use_real_hardware=true overrides hardware_mode
        if hardware_mode == "dummy" and use_real:
            hardware_mode = "real"

        hardware = Hardware(
            mode=hardware_mode,
            node=self if hardware_mode == "real" else None,
        )
        self.get_logger().info(f"Using Hardware(mode='{hardware_mode}')")

        self._registry = HandlerRegistry(hardware)

        self._action_server = ActionServer(
            self,
            BlocklyAction,
            "execute_blockly_action",
            execute_callback=self._execute_callback,
            goal_callback=self._goal_callback,
            cancel_callback=self._cancel_callback,
        )

        self.get_logger().info("ExecutorNode ready — waiting for action goals")

    def _goal_callback(self, goal_request) -> GoalResponse:
        """Accept all incoming goals."""
        self.get_logger().info(f"Received goal: command='{goal_request.command}'")
        return GoalResponse.ACCEPT

    def _cancel_callback(self, goal_handle: ServerGoalHandle) -> CancelResponse:
        """Accept all cancel requests."""
        self.get_logger().info("Received cancel request")
        return CancelResponse.ACCEPT

    def _execute_callback(self, goal_handle: ServerGoalHandle) -> BlocklyAction.Result:
        """
        Execute a single BlocklyAction goal.

        Sends 'executing' feedback, runs the command through HandlerRegistry,
        and returns the result.
        """
        request = goal_handle.request
        command = request.command
        param_keys = list(request.param_keys)
        param_values = list(request.param_values)

        self.get_logger().info(
            f"Executing: {command} keys={param_keys} values={param_values}"
        )

        # Send 'executing' feedback
        feedback = BlocklyAction.Feedback()
        feedback.status = "executing"
        goal_handle.publish_feedback(feedback)

        result = BlocklyAction.Result()

        try:
            # Parse parameters
            params = parse_params(param_keys, param_values)

            # Execute through handler registry
            success, message = self._registry.execute(command, params)
            result.success = success
            result.message = message

        except KeyError as e:
            result.success = False
            result.message = f"Missing required parameter: {e}"
            self.get_logger().warn(f"Missing parameter: {e}")

        except ValueError as e:
            result.success = False
            result.message = str(e)
            self.get_logger().warn(f"Parameter error: {e}")

        except Exception as e:
            result.success = False
            result.message = f"Unexpected error: {e}"
            self.get_logger().error(f"Unexpected error executing '{command}': {e}")

        # Always succeed at the goal level — the action server DID process
        # the goal. Whether the command itself succeeded or failed is
        # communicated through result.success and result.message.
        goal_handle.succeed()

        if result.success:
            self.get_logger().info(f"Command '{command}' succeeded: {result.message}")
        else:
            self.get_logger().warn(f"Command '{command}' failed: {result.message}")

        return result


def main(args=None):
    rclpy.init(args=args)

    node = ExecutorNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
