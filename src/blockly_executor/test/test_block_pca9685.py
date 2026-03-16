"""Integration tests for pwm_write handler (PCA9685)."""


def test_pwm_write_success(exe_action):
    result = exe_action("pwm_write", address="64", channel="0", value="2048")
    assert result.result.success is True
    assert "ch0" in result.result.message
    assert "2048" in result.result.message


def test_pwm_write_max_value(exe_action):
    result = exe_action("pwm_write", address="64", channel="15", value="4095")
    assert result.result.success is True


def test_pwm_write_zero_value(exe_action):
    result = exe_action("pwm_write", address="64", channel="0", value="0")
    assert result.result.success is True


def test_pwm_write_sends_feedback(exe_action):
    result = exe_action("pwm_write", address="64", channel="0", value="1000")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_pwm_write_missing_params_fails(exe_action):
    result = exe_action("pwm_write")
    assert result.result.success is False


def test_pwm_write_invalid_channel_fails(exe_action):
    result = exe_action("pwm_write", address="64", channel="16", value="100")
    assert result.result.success is False


def test_pwm_write_invalid_value_fails(exe_action):
    result = exe_action("pwm_write", address="64", channel="0", value="5000")
    assert result.result.success is False
