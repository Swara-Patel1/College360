"""
Shared pytest fixtures.

API integration tests talk to a running Django server over HTTP (stdlib
urllib, no extra deps). If the server is not reachable, those tests are
skipped rather than failed, so the pure-unit tests still run anywhere.
"""
import json
import os
import urllib.error
import urllib.request

import pytest

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://localhost:8000')

CREDENTIALS = {
    'admin':   ('admin@lju.edu.in', 'admin123'),
    'faculty': ('faculty1@lju.edu.in', 'fac123'),
    'hod':     ('hod@lju.edu.in', 'hod123'),
    'student': ('rushi@lju.edu.in', 'rushi123'),
}


def _request(method, path, token=None, data=None, timeout=30):
    url = path if path.startswith('http') else BASE_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.headers.get('Content-Type', ''), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type', ''), e.read()


class ApiClient:
    """Tiny authenticated HTTP client for the integration tests."""

    def __init__(self):
        self._tokens = {}

    def token(self, role):
        if role not in self._tokens:
            email, pw = CREDENTIALS[role]
            status, _, raw = _request('POST', '/api/auth/login/',
                                      data={'email': email, 'password': pw})
            assert status == 200, f'login for {role} failed with {status}: {raw[:200]}'
            self._tokens[role] = json.loads(raw)['access']
        return self._tokens[role]

    def get(self, path, role=None):
        return _request('GET', path, token=self.token(role) if role else None)

    def get_json(self, path, role=None):
        status, ct, raw = self.get(path, role)
        return status, (json.loads(raw) if raw and 'json' in ct else None)

    def post_json(self, path, data, role=None):
        status, ct, raw = _request('POST', path,
                                   token=self.token(role) if role else None, data=data)
        return status, (json.loads(raw) if raw and 'json' in ct else None)

    def patch_json(self, path, data, role=None):
        status, ct, raw = _request('PATCH', path,
                                   token=self.token(role) if role else None, data=data)
        return status, (json.loads(raw) if raw and 'json' in ct else None)


def _server_reachable():
    try:
        _request('GET', '/api/analytics/dashboard/', timeout=5)
        return True
    except Exception:
        return False


@pytest.fixture(scope='session')
def client():
    if not _server_reachable():
        pytest.skip(f'Django server not reachable at {BASE_URL}')
    return ApiClient()


@pytest.fixture(scope='session')
def student_id(client):
    """A concrete student_id for parametrised endpoints."""
    status, data = client.get_json('/api/students/my_profile/', role='student')
    assert status == 200, data
    return data['student_id']
