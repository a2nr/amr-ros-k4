# tests/test_block_led_on.py
"""
Integration test untuk instruksi Blockly: led_on

Setiap test mengirim BlocklyAction Goal ke Executor Node yang berjalan
dengan DummyHardware, lalu mengassert berdasarkan Feedback dan Result
yang diterima. Test tidak menyentuh implementasi internal sama sekali.
"""


def test_block_led_on_returns_success(exe_action):
    """Happy path: led_on dengan parameter lengkap harus berhasil."""
    result = exe_action("led_on", pin="3")

    assert result.result.success is True


def test_block_led_on_sends_executing_feedback(exe_action):
    """
    Executor harus mengirim feedback dengan status 'executing'
    sebelum action selesai. Feedback ini yang digunakan Blockly
    untuk menampilkan indikator bahwa action sedang berlangsung.
    """
    result = exe_action("led_on", pin="3")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_led_on_missing_pin_returns_failure(exe_action):
    """
    Sad path: led_on tanpa parameter pin harus gagal secara graceful.
    Sistem tidak boleh crash — harus mengembalikan success=False
    dengan pesan error yang informatif.
    """
    result = exe_action("led_on")  # sengaja tidak memberikan pin

    assert result.result.success is False


def test_block_led_on_missing_pin_message_mentions_pin(exe_action):
    """
    Pesan error harus menyebutkan nama parameter yang bermasalah
    agar mudah di-debug oleh user yang melihat pesan ini di Blockly UI.
    """
    result = exe_action("led_on")

    assert "pin" in result.result.message.lower()
