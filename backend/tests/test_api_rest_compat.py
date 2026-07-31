"""
Integration tests for the rest_compat layer and student profile — covering the
endpoints fixed earlier (notices POST, notifications, chatbot table, my_profile)
and the library issue/return round-trip.
"""
import pytest

pytestmark = pytest.mark.api


def test_my_profile_returns_real_data(client):
    status, data = client.get_json('/api/students/my_profile/', role='student')
    assert status == 200
    assert data['enrollment_no']
    assert data['department_name'] and data['department_name'] != '—'
    assert data['semester'] is not None


def test_notifications_endpoint_ok(client):
    # Previously 404 on every page — must now return a list.
    status, data = client.get_json(
        '/rest/v1/notifications?recipient_id=eq.804eb466-9035-5619-98aa-217cc6674345&limit=5',
        role='student')
    assert status == 200
    assert isinstance(data, list)
    if data:
        assert {'notification_id', 'title', 'is_read'}.issubset(data[0].keys())


def test_notices_list(client):
    status, data = client.get_json('/rest/v1/notices', role='admin')
    assert status == 200
    assert isinstance(data, list)


def test_notice_post_and_cleanup(client):
    """Posting a notice should succeed (regression for the department_id crash)."""
    title = 'PyTest Temp Notice'
    status, data = client.post_json('/rest/v1/notices',
                                    {'title': title, 'content': 'created by test suite',
                                     'notice_type': 'general', 'audience': 'all'},
                                    role='admin')
    assert status in (200, 201), data
    assert data.get('title') == title
    # cleanup
    nid = data.get('notice_id') or data.get('id')
    if nid:
        client.patch_json(f'/rest/v1/notices?notice_id=eq.{nid}', {}, role='admin')  # touch
    # best-effort delete via rest_compat DELETE
    from tests.conftest import _request
    _request('DELETE', f'/rest/v1/notices?notice_id=eq.{nid}', token=client.token('admin'))


def test_library_books_list(client):
    status, data = client.get_json('/rest/v1/library/books', role='student')
    assert status == 200
    assert isinstance(data, list) and len(data) > 0
    assert 'available_copies' in data[0]


def test_library_borrow_and_return_roundtrip(client):
    uid = '804eb466-9035-5619-98aa-217cc6674345'  # student rushi's user id
    # titles the student already has out — must not try to re-borrow these
    status, loans = client.get_json(f'/rest/v1/library/loans?student_id=eq.{uid}', role='student')
    assert status == 200
    already_out = {l['title'] for l in loans if l['status'] == 'issued'}
    # pick an available book the student does NOT already hold
    status, books = client.get_json('/rest/v1/library/books', role='student')
    assert status == 200
    available = [b for b in books
                 if b.get('available_copies', 0) > 0 and b['title'] not in already_out]
    assert available, 'no available un-borrowed books to test with'
    book = available[0]

    # borrow
    status, res = client.post_json('/rest/v1/library/loans',
                                   {'book_id': book['book_id'], 'student_id': uid, 'loan_days': 14},
                                   role='student')
    assert status == 200
    assert not (res or {}).get('error'), res

    # it should appear as an issued loan
    status, loans = client.get_json(f'/rest/v1/library/loans?student_id=eq.{uid}', role='student')
    assert status == 200
    issued = [l for l in loans if l['title'] == book['title'] and l['status'] == 'issued']
    assert issued, 'borrowed book not found in loans'

    # return it (cleanup)
    loan_id = issued[0]['loan_id']
    status, _ = client.patch_json(f'/rest/v1/library/loans?loan_id=eq.{loan_id}',
                                  {'action': 'return'}, role='student')
    assert status == 200


def test_chatbot_message_roundtrip(client):
    """Chatbot must persist messages (regression for missing chatbot_chatmessage table)."""
    status, data = client.post_json('/api/chat/', {'message': 'Test from pytest suite'},
                                    role='student')
    assert status == 200, data
    assert 'ai_response' in data and data['ai_response'].get('message')
