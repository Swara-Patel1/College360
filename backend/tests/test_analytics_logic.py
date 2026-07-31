"""Unit tests for pure analytics computation logic (no DB access)."""
import pytest

from analytics import services

pytestmark = pytest.mark.unit


def test_gp_prefers_explicit_grade_points():
    # When grade_points is supplied it wins over the letter map.
    assert services._gp_for('AA', 9.3) == 9.3


def test_gp_falls_back_to_letter_map():
    assert services._gp_for('AA', None) == 10
    assert services._gp_for('BB', None) == 8


def test_gp_fail_is_zero():
    assert services._gp_for('F', None) == 0
    assert services._gp_for('FF', None) == 0


def test_gp_unknown_grade_is_zero():
    assert services._gp_for('ZZ', None) == 0


def test_gp_case_insensitive():
    assert services._gp_for('aa', None) == 10


@pytest.mark.parametrize('grade,points', [
    ('A+', 10), ('A', 9), ('B+', 8), ('B', 7), ('C', 5), ('D', 4),
])
def test_grade_points_map(grade, points):
    assert services.GRADE_POINTS[grade] == points


def test_gp_handles_bad_grade_points_value():
    # Non-numeric grade_points should not crash; falls back to the letter map.
    assert services._gp_for('BB', 'not-a-number') == 8
