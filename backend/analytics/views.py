"""
Analytics API (DRF) — server-computed academic/financial figures.

Endpoints (mounted under /api/analytics/):
  GET /me/summary/                    → academic summary for logged-in student
  GET /student/<id>/summary/          → academic summary (staff or self)
  GET /student/<id>/grades/           → grade distribution (staff or self)
  GET /fees/summary/                  → fee roll-up by department (staff)
  GET /attendance/overview/           → per-subject attendance (staff)
  GET /dashboard/                     → institute-wide dashboard aggregates
"""
from django.db import connection

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from . import services


def _resolve_student_id(request):
    email = (getattr(request.user, 'email', '') or '').strip()
    uid = str(getattr(request.user, 'pk', '') or '')
    with connection.cursor() as cur:
        cur.execute("""
            SELECT CAST(s.student_id AS TEXT) FROM students s
            LEFT JOIN users u ON CAST(u.id AS TEXT)=CAST(s.user_id AS TEXT)
            WHERE LOWER(u.email)=LOWER(%s) OR CAST(s.user_id AS TEXT)=%s OR CAST(s.student_id AS TEXT)=%s
            LIMIT 1
        """, [email, uid, uid])
        row = cur.fetchone()
    return row[0] if row else None


def _is_staff(request):
    roles = (getattr(request.user, 'roles', '') or getattr(request.user, 'role', '') or '').lower()
    return any(r in roles for r in ('admin', 'faculty', 'hod')) or bool(getattr(request.user, 'is_staff', False))


def _guard(request, student_id):
    return _is_staff(request) or _resolve_student_id(request) == str(student_id)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_summary(request):
    sid = _resolve_student_id(request)
    if not sid:
        return Response({'error': 'No student profile linked.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(services.student_academic_summary(sid))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_summary(request, student_id):
    if not _guard(request, student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    data = services.student_academic_summary(student_id)
    if data is None:
        return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_grades(request, student_id):
    if not _guard(request, student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    data = services.grade_distribution(student_id)
    if data is None:
        return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fees_summary(request):
    if not _is_staff(request):
        return Response({'error': 'Only staff can view fee analytics.'}, status=status.HTTP_403_FORBIDDEN)
    dept = request.query_params.get('department_id', '').replace('eq.', '') or None
    return Response(services.fee_summary(dept))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance_overview(request):
    if not _is_staff(request):
        return Response({'error': 'Only staff can view attendance analytics.'}, status=status.HTTP_403_FORBIDDEN)
    dept = request.query_params.get('department_id', '').replace('eq.', '') or None
    return Response(services.attendance_overview(dept))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    return Response(services.institute_dashboard())
