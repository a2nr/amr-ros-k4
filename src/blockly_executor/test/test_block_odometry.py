"""Integration tests for odometry_read handler (nav_msgs/Odometry interface).

Handler returns JSON with all 6 fields: x, y, heading, vx, vy, omega_z.
"""

import json


def test_odometry_read_returns_json(exe_action):
    """Handler returns JSON with all 6 fields."""
    result = exe_action("odometry_read", source="encoder")
    assert result.result.success is True
    data = json.loads(result.result.message)
    assert "x" in data
    assert "y" in data
    assert "heading" in data
    assert "vx" in data
    assert "vy" in data
    assert "omega_z" in data


def test_odometry_read_dummy_values(exe_action):
    """Dummy mode returns all zeros."""
    result = exe_action("odometry_read", source="encoder")
    data = json.loads(result.result.message)
    assert data["x"] == 0.0
    assert data["y"] == 0.0
    assert data["heading"] == 0.0
    assert data["vx"] == 0.0
    assert data["vy"] == 0.0
    assert data["omega_z"] == 0.0


def test_odometry_read_default_source(exe_action):
    """When source param is omitted, defaults to encoder."""
    result = exe_action("odometry_read")
    assert result.result.success is True
    data = json.loads(result.result.message)
    assert data["x"] == 0.0


def test_odometry_read_sends_feedback(exe_action):
    result = exe_action("odometry_read", source="encoder")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"
