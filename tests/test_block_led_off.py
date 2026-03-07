# tests/test_block_led_off.py
"""
Integration test untuk instruksi Blockly: led_off

Setiap test mengirim BlocklyAction Goal ke Executor Node yang berjalan
dengan DummyHardware, lalu mengassert berdasarkan Feedback dan Result
yang diterima. Test tidak menyentuh implementasi internal sama sekali.
"""


def test_block_led_off_returns_success(exe_action):
    """Happy path: led_off dengan parameter lengkap harus berhasil."""
    result = exe_action("led_off", pin="3")

    assert result.result.success is True


def test_block_led_off_sends_executing_feedback(exe_action):
    """
    Executor harus mengirim feedback dengan status 'executing'
    sebelum action selesai.
    """
    result = exe_action("led_off", pin="3")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_led_off_missing_pin_returns_failure(exe_action):
    """Sad path: led_off tanpa pin harus gagal secara graceful."""
    result = exe_action("led_off")  # sengaja tanpa pin

    assert result.result.success is False
    assert "pin" in result.result.message.lower()
