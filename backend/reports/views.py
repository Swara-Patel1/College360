"""
Report download API (DRF).

Endpoints (mounted under /api/reports/):
  GET /marksheet/<student_id>/   → academic marksheet (PDF)
  GET /fee-statement/<id>/       → fee statement (PDF)
  GET /attendance/<id>/          → attendance report (Excel)
  GET /department-summary/       → institute department summary (Excel, staff)
  GET /my/marksheet/             → marksheet for the logged-in student (PDF)
"""
from django.db import connection
from django.http import HttpResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from . import services

PDF = 'application/pdf'
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def _file_response(data, content_type, filename):
    resp = HttpResponse(data, content_type=content_type)
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    resp['Content-Length'] = str(len(data))
    return resp


def _resolve_student_id(request):
    email = (getattr(request.user, 'email', '') or '').strip()
    uid = str(getattr(request.user, 'pk', '') or '')
    with connection.cursor() as cur:
        cur.execute("""
            SELECT CAST(s.student_id AS TEXT) FROM students s
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            WHERE LOWER(u.email)=LOWER(%s) OR CAST(s.user_id AS TEXT)=%s OR CAST(s.student_id AS TEXT)=%s
            LIMIT 1
        """, [email, uid, uid])
        row = cur.fetchone()
    return row[0] if row else None


def _is_staff(request):
    roles = (getattr(request.user, 'roles', '') or getattr(request.user, 'role', '') or '').lower()
    return any(r in roles for r in ('admin', 'faculty', 'hod')) or bool(getattr(request.user, 'is_staff', False))


def _guard(request, student_id):
    """Students may only pull their own reports; staff may pull anyone's."""
    if _is_staff(request):
        return True
    return _resolve_student_id(request) == str(student_id)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def marksheet(request, student_id):
    if not _guard(request, student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    pdf = services.generate_marksheet_pdf(student_id)
    if pdf is None:
        return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
    return _file_response(pdf, PDF, f'marksheet_{student_id}.pdf')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fee_statement(request, student_id):
    if not _guard(request, student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    pdf = services.generate_fee_statement_pdf(student_id)
    if pdf is None:
        return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
    return _file_response(pdf, PDF, f'fee_statement_{student_id}.pdf')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance(request, student_id):
    if not _guard(request, student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    xlsx = services.generate_attendance_excel(student_id)
    if xlsx is None:
        return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
    return _file_response(xlsx, XLSX, f'attendance_{student_id}.xlsx')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def department_summary(request):
    if not _is_staff(request):
        return Response({'error': 'Only staff can export this report.'}, status=status.HTTP_403_FORBIDDEN)
    xlsx = services.generate_department_summary_excel()
    return _file_response(xlsx, XLSX, 'department_summary.xlsx')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_marksheet(request):
    sid = _resolve_student_id(request)
    if not sid:
        return Response({'error': 'No student profile linked to this account.'},
                        status=status.HTTP_404_NOT_FOUND)
    pdf = services.generate_marksheet_pdf(sid)
    return _file_response(pdf, PDF, 'my_marksheet.pdf')
