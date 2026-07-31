"""Integration tests for authentication."""
import pytest

pytestmark = pytest.mark.api


@pytest.mark.parametrize('role', ['admin', 'faculty', 'hod', 'student'])
def test_login_succeeds_for_each_role(client, role):
    token = client.token(role)
    assert token and len(token) > 20


def test_login_returns_user_object(client):
    status, data = client.post_json('/api/auth/login/',
                                    {'email': 'rushi@lju.edu.in', 'password': 'rushi123'})
    assert status == 200
    assert 'access' in data and 'user' in data
    assert data['user']['role'].lower() == 'student'


def test_login_rejects_bad_password(client):
    status, _ = client.post_json('/api/auth/login/',
                                 {'email': 'rushi@lju.edu.in', 'password': 'wrong-pw'})
    assert status in (400, 401)


def test_protected_endpoint_requires_auth(client):
    status, _ct, _raw = client.get('/api/students/my_profile/')  # no token
    assert status in (401, 403)
