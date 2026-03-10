"""
Blockly ROS2 Robot Controller — Desktop Application Entry Point.

Combines pywebview (desktop UI) with a ROS2 Action Client that runs
in a background thread. The BlocklyAPI class exposes execute_action()
to JavaScript, bridging Blockly's runtime with the ROS2 Executor Node.
"""

import json
import os
import sys
import time
import threading
import logging

import tkinter as _tk
from tkinter import filedialog as _filedialog

import webview
import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor

from blockly_interfaces.action import BlocklyAction

logger = logging.getLogger(__name__)


def _native_save_dialog(suggested: str = "workspace.json") -> str:
    """
    Open a native "Save As" file dialog using tkinter.

    tkinter uses its own Tcl/Tk interpreter — no Qt thread conflict.
    filedialog.asksaveasfilename() blocks the calling thread until the
    user picks a file or cancels. Returns "" on cancel.
    """
    root = _tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    path = _filedialog.asksaveasfilename(
        title="Save Workspace",
        defaultextension=".json",
        initialfile=suggested,
        filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
    )
    root.destroy()
    return path or ""


def _native_open_dialog() -> str:
    """
    Open a native "Open" file dialog using tkinter.
    Returns "" on cancel.
    """
    root = _tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    path = _filedialog.askopenfilename(
        title="Load Workspace",
        filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
    )
    root.destroy()
    return path or ""


class _CancelledError(Exception):
    """Raised when a wait is cancelled via cancel_event."""
    pass


def _wait_for_future(future, timeout_sec: float = 30.0, cancel_event=None):
    """
    Wait for an rclpy Future to complete without calling spin.

    The node is already being spun by a background thread, so futures
    will be resolved by that thread's spin loop. This function simply
    polls future.done() with a small sleep to avoid busy-waiting.

    If cancel_event is provided and gets set, raises _CancelledError.
    Raises TimeoutError if the future doesn't complete within timeout.
    """
    deadline = time.monotonic() + timeout_sec
    while not future.done():
        if cancel_event is not None and cancel_event.is_set():
            raise _CancelledError("Cancelled by user")
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
        self._cancel_event = threading.Event()

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

        # Clear cancel state for this new action
        self._cancel_event.clear()

        # Send goal and wait for result
        try:
            send_future = self._client.send_goal_async(goal)

            # Wait for goal acceptance — the background spin thread
            # processes callbacks that resolve this future.
            goal_handle = _wait_for_future(
                send_future, timeout_sec=10.0,
                cancel_event=self._cancel_event,
            )

            if not goal_handle.accepted:
                return {
                    "success": False,
                    "message": "Goal was rejected by action server",
                }

            # Wait for result
            result_future = goal_handle.get_result_async()
            wrapped = _wait_for_future(
                result_future, timeout_sec=30.0,
                cancel_event=self._cancel_event,
            )
            result = wrapped.result

            return {
                "success": result.success,
                "message": result.message,
            }

        except _CancelledError:
            logger.info("Action cancelled by user")
            return {
                "success": False,
                "message": "Cancelled by user",
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

    def cancel_action(self) -> dict:
        """
        Cancel the currently running action.

        Called from JS via cancelCurrentAction() in bridge.js.
        Sets the cancel event so _wait_for_future() returns early.
        """
        logger.info("cancel_action: cancel requested from JS")
        self._cancel_event.set()
        return {"success": True, "message": "Cancel requested"}

    def save_workspace(self, json_string: str) -> dict:
        """
        Open a native OS "Save As" dialog via zenity/kdialog subprocess and
        write workspace JSON to the chosen file.

        Called from JS: await window.pywebview.api.save_workspace(jsonString)

        Using subprocess avoids all Qt thread constraints — zenity/kdialog run
        in their own process, blocking the pywebview bridge thread until the
        user confirms or cancels.
        """
        try:
            path = _native_save_dialog("workspace.json")
            if not path:
                return {"success": False, "error": "Cancelled"}
            with open(path, "w", encoding="utf-8") as f:
                f.write(json_string)
            logger.info(f"Workspace saved to: {path}")
            return {"success": True, "path": path}
        except Exception as e:
            logger.error(f"save_workspace error: {e}")
            return {"success": False, "error": str(e)}

    def load_workspace(self) -> dict:
        """
        Open a native OS "Open" dialog via zenity/kdialog and read the file.

        Called from JS: await window.pywebview.api.load_workspace()
        """
        try:
            path = _native_open_dialog()
            if not path:
                return {"success": False, "error": "Cancelled"}
            with open(path, "r", encoding="utf-8") as f:
                data = f.read()
            json.loads(data)  # validate before sending to JS
            logger.info(f"Workspace loaded from: {path}")
            return {"success": True, "data": data, "path": path}
        except json.JSONDecodeError:
            return {"success": False, "error": "File is not valid JSON"}
        except Exception as e:
            logger.error(f"load_workspace error: {e}")
            return {"success": False, "error": str(e)}


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

    # Resolve path to UI — ui/ is inside the Python module directory
    # blockly_app/blockly_app/app.py → blockly_app/blockly_app/ui/
    module_dir = os.path.dirname(os.path.abspath(__file__))
    ui_dir = os.path.join(module_dir, "ui")
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
