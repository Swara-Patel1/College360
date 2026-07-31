"""Integration tests for the report-download API (PDF / Excel)."""
import pytest

pytestmark = pytest.mark.api

PDF_MAGIC = b'%PDF-'
XLSX_MAGIC = b'PK\x03\x04'


def test_my_marksheet_pdf(client):
    status, ct, raw = client.get('/api/reports/my/marksheet/', role='student')
    assert status == 200
    assert 'pdf' in ct
    assert raw[:5] == PDF_MAGIC
    assert len(raw) > 800


def test_department_summary_xlsx(client):
    status, ct, raw = client.get('/api/reports/department-summary/', role='admin')
    assert status == 200
    assert 'spreadsheet' in ct
    assert raw[:4] == XLSX_MAGIC


def test_department_summary_forbidden_for_student(client):
    status, _ct, _raw = client.get('/api/reports/department-summary/', role='student')
    assert status == 403


def test_attendance_xlsx_by_id(client, student_id):
    status, ct, raw = client.get(f'/api/reports/attendance/{student_id}/', role='admin')
    assert status == 200
    assert raw[:4] == XLSX_MAGIC


def test_fee_statement_pdf_by_id(client, student_id):
    status, ct, raw = client.get(f'/api/reports/fee-statement/{student_id}/', role='admin')
    assert status == 200
    assert raw[:5] == PDF_MAGIC


def test_student_cannot_pull_other_students_report(client):
    # A made-up id that isn't this student → must be forbidden (or not found), never 200.
    status, _ct, _raw = client.get('/api/reports/marksheet/00000000-0000-0000-0000-000000000000/',
                                   role='student')
    assert status in (403, 404)
