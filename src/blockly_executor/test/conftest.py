# tests/conftest.py
import pytest
import rclpy
from types import SimpleNamespace
from rclpy.action import ActionClient
from rclpy.node import Node
from blockly_interfaces.action import BlocklyAction


@pytest.fixture(scope="session")
def ros_context():
    """
    Inisialisasi ROS2 tepat satu kali untuk seluruh sesi test.

    scope="session" mencegah rclpy.init() / rclpy.shutdown() dipanggil
    berkali-kali, yang akan menyebabkan error "already initialized" dan
    membuat state context menjadi tidak bersih.
    """
    rclpy.init()
    yield
    rclpy.shutdown()


@pytest.fixture
def exe_action(ros_context):
    """
    Fixture utama yang disuntikkan ke setiap fungsi test.

    Mengembalikan fungsi _send yang menerima nama command dan parameter
    opsional sebagai keyword arguments, mengirimnya sebagai ROS2 Action Goal,
    mengumpulkan semua feedback yang datang, dan mengembalikan bundle untuk
    digunakan sebagai assertion.

    Setiap test mendapat client_node yang bersih untuk menghindari state
    yang bocor antar test. Tidak ada background thread di sini — spinning
    client_node dilakukan secara sinkron di test thread itu sendiri.

    Contoh penggunaan di test:
        result = exe_action("led_on", pin="3")
        result = exe_action("delay", duration_ms="500")
        result = exe_action("led_on")   # tanpa pin — untuk sad path
    """
    client_node = Node("test_action_client")
    client = ActionClient(client_node, BlocklyAction, "execute_blockly_action")

    # Pastikan executor sudah siap sebelum test berjalan.
    # Jika dalam 5 detik server tidak ditemukan, test di-skip dengan pesan
    # yang jelas daripada gagal dengan error timeout yang kriptikal.
    server_ready = client.wait_for_server(timeout_sec=5.0)
    if not server_ready:
        client_node.destroy_node()
        pytest.skip(
            "Executor Node tidak ditemukan. "
            "Jalankan `pixi run executor` di terminal terpisah terlebih dahulu."
        )

    def _send(command: str, **kwargs) -> SimpleNamespace:
        goal = BlocklyAction.Goal()
        goal.command      = command
        goal.param_keys   = list(kwargs.keys())
        goal.param_values = [str(v) for v in kwargs.values()]

        feedbacks = []

        # Kirim goal dan tunggu goal_handle (konfirmasi server menerima goal).
        send_future = client.send_goal_async(
            goal,
            feedback_callback=lambda fb: feedbacks.append(fb.feedback)
        )
        rclpy.spin_until_future_complete(client_node, send_future)
        goal_handle = send_future.result()

        # Tunggu result akhir dari server.
        # Feedback akan terus di-collect selama spin ini berlangsung
        # karena feedback_callback sudah terdaftar di atas.
        result_future = goal_handle.get_result_async()
        rclpy.spin_until_future_complete(client_node, result_future)
        result = result_future.result().result

        return SimpleNamespace(feedbacks=feedbacks, result=result)

    yield _send

    # Cleanup: hancurkan node setelah test selesai agar tidak ada node
    # yang "tercecer" dan menyebabkan name conflict di test berikutnya.
    client_node.destroy_node()
