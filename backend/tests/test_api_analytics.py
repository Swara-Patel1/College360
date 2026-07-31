"""Integration tests for the analytics API (server-computed figures)."""
import pytest

pytestmark = pytest.mark.api


def test_my_summary(client):
    status, data = client.get_json('/api/analytics/me/summary/', role='student')
    assert status == 200
    assert 0.0 <= data['cgpa'] <= 10.0
    assert data['total_credits'] >= 0
    assert data['attendance']['status'] in ('good', 'shortage')
    assert data['standing'] in ('distinction', 'first_class', 'pass', 'at_risk')


def test_my_summary_sgpa_present(client):
    status, data = client.get_json('/api/analytics/me/summary/', role='student')
    assert status == 200
    assert isinstance(data['sgpa_by_semester'], dict)
    for v in data['sgpa_by_semester'].values():
        assert 0.0 <= v <= 10.0


def test_dashboard_aggregates(client):
    status, data = client.get_json('/api/analytics/dashboard/', role='student')
    assert status == 200
    for key in ('students', 'faculty', 'departments', 'subjects', 'avg_attendance', 'avg_gpa'):
        assert key in data
    assert data['students'] > 0
    assert 0 <= data['avg_attendance'] <= 100


def test_fees_summary_staff_only(client):
    status, _ = client.get_json('/api/analytics/fees/summary/', role='student')
    assert status == 403
    status, data = client.get_json('/api/analytics/fees/summary/', role='admin')
    assert status == 200
    t = data['totals']
    assert t['billed'] >= t['paid'] >= 0
    assert abs((t['billed'] - t['paid']) - t['pending']) < 1.0


def test_grade_distribution_percentages_sum(client, student_id):
    status, data = client.get_json(f'/api/analytics/student/{student_id}/grades/', role='admin')
    assert status == 200
    if data['total'] > 0:
        total_pct = sum(row['percentage'] for row in data['distribution'])
        assert 99.0 <= total_pct <= 101.0  # rounding tolerance


def test_attendance_overview_staff(client):
    status, data = client.get_json('/api/analytics/attendance/overview/', role='admin')
    assert status == 200
    assert 'subjects' in data
