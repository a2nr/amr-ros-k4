"""Integration tests for digital_out and digital_in handlers."""


# --- digital_out tests ---


def test_digital_out_high(exe_action):
    result = exe_action("digital_out", gpio="17", state="true")
    assert result.result.success is True
    assert "HIGH" in result.result.message


def test_digital_out_low(exe_action):
    result = exe_action("digital_out", gpio="17", state="false")
    assert result.result.success is True
    assert "LOW" in result.result.message


def test_digital_out_sends_feedback(exe_action):
    result = exe_action("digital_out", gpio="17", state="true")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_digital_out_missing_gpio_fails(exe_action):
    result = exe_action("digital_out")
    assert result.result.success is False


# --- digital_in tests ---


def test_digital_in_returns_success(exe_action):
    result = exe_action("digital_in", gpio="5")
    assert result.result.success is True


def test_digital_in_returns_numeric(exe_action):
    result = exe_action("digital_in", gpio="5")
    assert result.result.message in ("0", "1")


def test_digital_in_sends_feedback(exe_action):
    result = exe_action("digital_in", gpio="5")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_digital_in_missing_gpio_fails(exe_action):
    result = exe_action("digital_in")
    assert result.result.success is False
