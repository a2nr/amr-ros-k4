"""Integration tests for encoder_read handler (AS5600)."""


def test_encoder_read_success(exe_action):
    result = exe_action("encoder_read", encoder_id="0")
    assert result.result.success is True
    # Dummy mode returns "0.0"
    angle = float(result.result.message)
    assert 0.0 <= angle <= 360.0


def test_encoder_read_id_1(exe_action):
    result = exe_action("encoder_read", encoder_id="1")
    assert result.result.success is True


def test_encoder_read_id_2(exe_action):
    result = exe_action("encoder_read", encoder_id="2")
    assert result.result.success is True


def test_encoder_read_sends_feedback(exe_action):
    result = exe_action("encoder_read", encoder_id="0")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_encoder_read_missing_params_fails(exe_action):
    result = exe_action("encoder_read")
    assert result.result.success is False
