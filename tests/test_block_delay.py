# tests/test_block_delay.py
"""
Integration test untuk instruksi Blockly: delay

Setiap test mengirim BlocklyAction Goal ke Executor Node yang berjalan
dengan DummyHardware, lalu mengassert berdasarkan Feedback dan Result
yang diterima. Test tidak menyentuh implementasi internal sama sekali.
"""
import time


def test_block_delay_returns_success(exe_action):
    """Happy path: delay dengan parameter lengkap harus berhasil."""
    result = exe_action("delay", duration_ms="100")

    assert result.result.success is True


def test_block_delay_sends_executing_feedback(exe_action):
    """
    Executor harus mengirim feedback dengan status 'executing'
    sebelum action selesai.
    """
    result = exe_action("delay", duration_ms="100")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_delay_duration_is_respected(exe_action):
    """
    Memverifikasi bahwa durasi yang dieksekusi mendekati nilai yang diminta.
    Toleransi ±100ms diberikan untuk mengakomodasi overhead ROS2 dan jitter OS.
    """
    requested_ms = 500
    tolerance_ms = 100

    start      = time.monotonic()
    exe_action("delay", duration_ms=str(requested_ms))
    elapsed_ms = (time.monotonic() - start) * 1000

    assert elapsed_ms >= (requested_ms - tolerance_ms), \
        f"Delay terlalu singkat: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"
    assert elapsed_ms <= (requested_ms + tolerance_ms), \
        f"Delay terlalu lama: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"


def test_block_delay_missing_duration_returns_failure(exe_action):
    """Sad path: delay tanpa duration_ms harus gagal secara graceful."""
    result = exe_action("delay")  # sengaja tanpa duration_ms

    assert result.result.success is False
    assert "duration_ms" in result.result.message.lower()
