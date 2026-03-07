"""
Blockly ROS2 Robot Controller — Desktop Application Entry Point.

Combines pywebview (desktop UI) with a ROS2 Action Client that runs
in a background thread. The BlocklyAPI class exposes execute_action()
to JavaScript, bridging Blockly's runtime with the ROS2 Executor Node.
"""

import os
import sys
import time
import threading
import logging

import webview
import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor

from interfaces.action import BlocklyAction

logger = logging.getLogger(__name__)


def _wait_for_future(future, timeout_sec: float = 30.0):
    """
    Wait for an rclpy Future to complete without calling spin.

    The node is already being spun by a background thread, so futures
    will be resolved by that thread's spin loop. This function simply
    polls future.done() with a small sleep to avoid busy-waiting.

    Raises TimeoutError if the future doesn't complete within timeout.
    """
    deadline = time.monotonic() + timeout_sec
    while not future.done():
        if time.monotonic() > deadline:
            raise TimeoutError(
                f"Future did not complete within {timeout_sec}s"
            )
        time.sleep(0.01)  # 10ms polling interval
    return future.result()


class BlocklyAPI:
    """
    Python API exposed to JavaScript via pywebview bridge.

    Each method in this class can be called from JavaScript as:
        window.pywebview.api.<method_name>(args)

    The execute_action() method is synchronous from JS's perspective —
    it blocks until the ROS2 Action completes, then returns the result.
    """

    def __init__(self, ros_node: Node, action_client: ActionClient) -> None:
        self._node = ros_node
        self._client = action_client

    def execute_action(
        self,
        command: str,
        param_keys: list[str],
        param_values: list[str],
    ) -> dict:
        """
        Send a ROS2 Action Goal and wait for the result.

        Called by Blockly's executor.js via pywebview bridge.
        This call is synchronous — it does not return until the
        ROS2 Action Server sends back a Result.

        The node is already being spun by a background thread, so we
        must NOT call rclpy.spin_until_future_complete() here — that
        would conflict with the background spin and raise
        "Executor is already spinning". Instead we poll future.done().

        Args:
            command: The command name (e.g. "led_on", "delay").
            param_keys: List of parameter names.
            param_values: List of parameter values (as strings).

        Returns:
            Dict with 'success' (bool) and 'message' (str).
        """
        logger.info(
            f"execute_action: command={command}, "
            f"keys={param_keys}, values={param_values}"
        )

        # Build the goal
        goal = BlocklyAction.Goal()
        goal.command = command
        goal.param_keys = param_keys
        goal.param_values = param_values

        # Wait for action server
        if not self._client.wait_for_server(timeout_sec=5.0):
            logger.error("Action server not available")
            return {
                "success": False,
                "message": "Action server not available (timeout 5s)",
            }

        # Send goal and wait for result
        try:
            send_future = self._client.send_goal_async(goal)

            # Wait for goal acceptance — the background spin thread
            # processes callbacks that resolve this future.
            goal_handle = _wait_for_future(send_future, timeout_sec=10.0)

            if not goal_handle.accepted:
                return {
                    "success": False,
                    "message": "Goal was rejected by action server",
                }

            # Wait for result
            result_future = goal_handle.get_result_async()
            wrapped = _wait_for_future(result_future, timeout_sec=30.0)
            result = wrapped.result

            return {
                "success": result.success,
                "message": result.message,
            }

        except TimeoutError as e:
            logger.error(f"Timeout: {e}")
            return {
                "success": False,
                "message": str(e),
            }

        except Exception as e:
            logger.exception(f"Error executing action: {e}")
            return {
                "success": False,
                "message": f"Error: {str(e)}",
            }


def main():
    """Application entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    # Initialize ROS2
    rclpy.init()
    node = Node("blockly_action_client")
    action_client = ActionClient(node, BlocklyAction, "execute_blockly_action")

    logger.info("ROS2 Action Client node initialized")

    # Spin ROS2 in a background thread using MultiThreadedExecutor
    # so that the action client callbacks (goal response, result)
    # are processed concurrently while pywebview runs on the main thread.
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    # Create pywebview API
    api = BlocklyAPI(node, action_client)

    # Resolve path to UI
    ui_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
    index_path = os.path.join(ui_dir, "index.html")

    if not os.path.exists(index_path):
        logger.error(f"UI file not found: {index_path}")
        sys.exit(1)

    logger.info(f"Loading UI from: {index_path}")

    # Create and start pywebview window
    window = webview.create_window(
        "Blockly ROS2 Robot Controller",
        url=index_path,
        js_api=api,
        width=1200,
        height=800,
        min_size=(800, 600),
    )

    webview.start(debug=True)

    # Cleanup
    logger.info("Shutting down...")
    executor.shutdown()
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()
