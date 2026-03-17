"""Integration tests for odometry_read handler (nav_msgs/Odometry interface)."""


def test_odometry_read_x(exe_action):
    result = exe_action("odometry_read", source="encoder", field="x")
    assert result.result.success is True
    value = float(result.result.message)
    assert value == 0.0  # Dummy mode returns 0.0


def test_odometry_read_y(exe_action):
    result = exe_action("odometry_read", source="encoder", field="y")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_heading(exe_action):
    result = exe_action("odometry_read", source="encoder", field="heading")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_vx(exe_action):
    result = exe_action("odometry_read", source="encoder", field="vx")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_vy(exe_action):
    result = exe_action("odometry_read", source="encoder", field="vy")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_omega_z(exe_action):
    result = exe_action("odometry_read", source="encoder", field="omega_z")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_default_source(exe_action):
    """When source param is omitted, defaults to encoder."""
    result = exe_action("odometry_read", field="x")
    assert result.result.success is True
    assert float(result.result.message) == 0.0


def test_odometry_read_sends_feedback(exe_action):
    result = exe_action("odometry_read", source="encoder", field="x")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_odometry_read_missing_field_fails(exe_action):
    result = exe_action("odometry_read", source="encoder")
    assert result.result.success is False
