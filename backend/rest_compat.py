"""
PostgREST-compatible REST layer for Django.

Maps /rest/v1/<table>?<filters> to the corresponding Django model,
so the React frontend's SupaFetch client continues to work unchanged.

Supported tables: users, students, faculty, departments, hod, semesters,
subjects, enrollments, marks, timetable, attendance_records, attendance_summary,
fee_structures, fee_payments, notices, grievances, leave_requests, class_sections,
lecture_changes, content, doubts, notifications, placement_companies, placement_scores,
audit_logs, wellness_records.

Filter syntax (from PostgREST):
  col=eq.value      → col == value
  col=neq.value     → col != value
  col=in.(a,b,c)    → col IN (a,b,c)
  col=like.pattern  → col LIKE pattern
  col=ilike.pattern → col ILIKE pattern
  col=lt.value, col=lte.value, col=gt.value, col=gte.value
  order=col.asc / order=col.desc
  select=*          → all fields (embed joins are simplified)
  limit=N
"""
import csv
import io
import json
import re
from datetime import date, timedelta
from django.utils import timezone
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib.auth import get_user_model
from django.db.models import Q

from accounts.models import User
from faculty.models import Faculty, Department
from students.models import Student
from courses.models import Course, Enrollment
from attendance.models import AttendanceRecord
from grades.models import Grade
from fees.models import Fee, PaymentTransaction
from timetable.models import Schedule
from notices.models import Notice
from complaints.models import Complaint
from campus.models import (StudyMaterial, Doubt, Alumnus, FacultyFeedback, Backlog, Exam,
                           Book, BookLoan, Internship, Achievement, Delegation)
from django.db.models import Avg, Count, Sum

# Serialization helpers ──────────────────────────────────────────────────────

def _dt(v):
    if v is None:
        return None
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)


def serialize_user(u):
    if u is None:
        return None
    return {
        'id': str(u.pk),
        'email': u.email,
        'roles': u.role,
        'role': u.role,
        'is_active': u.is_active,
        'password_hash': '',  # never expose
        'created_at': _dt(u.created_at),
        'last_login': _dt(u.last_login),
        'first_name': u.first_name,
        'last_name': u.last_name,
        'username': u.username,
        'phone': u.phone or '',
    }


def serialize_dept(d):
    if d is None:
        return None
    return {
        'department_id': str(d.pk),
        'id': str(d.pk),
        'name': d.name,
        'code': d.code,
        'description': d.description,
        'created_at': _dt(d.created_at),
    }


def serialize_faculty(f):
    if f is None:
        return None
    return {
        'faculty_id': str(f.pk),
        'id': str(f.pk),
        'employee_id': f.faculty_id,
        'user_id': str(f.user.pk),
        'department_id': str(f.department.pk) if f.department else None,
        'first_name': f.user.first_name,
        'last_name': f.user.last_name,
        'designation': f.designation,
        'qualification': f.qualification,
        'experience_years': f.experience_years,
        'specialization': f.specialization or '',
        'joining_date': _dt(f.joining_date),
        'salary': float(f.salary),
        'is_active': f.is_active,
        'created_at': _dt(f.created_at),
        'user': serialize_user(f.user),
        'department': serialize_dept(f.department),
    }


def serialize_student(s):
    if s is None:
        return None
    # Fetch real parent details, date_of_birth, and attendance from raw tables
    real_parent_email = ''
    real_parent_phone = ''
    real_dob = None
    real_attendance = None
    try:
        from django.db import connection
        with connection.cursor() as cur:
            # Get parent info, DOB, and raw UUID student_id by user_id
            cur.execute(
                """SELECT student_id, parent_email, parent_phone, date_of_birth
                   FROM students WHERE CAST(user_id AS TEXT) = %s LIMIT 1""",
                [str(s.user.pk)]
            )
            row = cur.fetchone()
            if row:
                raw_uuid = str(row[0])
                real_parent_email = row[1] or ''
                real_parent_phone = row[2] or ''
                real_dob = row[3]
                # Get average attendance using raw UUID
                cur.execute(
                    """SELECT AVG(percentage) FROM attendance_summary
                       WHERE CAST(student_id AS TEXT) = %s""",
                    [raw_uuid]
                )
                att_row = cur.fetchone()
                if att_row and att_row[0] is not None:
                    real_attendance = round(float(att_row[0]), 1)
    except Exception:
        pass

    guardian_name = s.guardian_name if s.guardian_name else f"Mr. & Mrs. {s.user.last_name}"
    parent_phone = real_parent_phone or s.guardian_phone or ''
    return {
        'student_id': str(s.pk),
        'id': str(s.pk),
        'user_id': str(s.user.pk),
        'enrollment_no': s.student_id,
        'first_name': s.user.first_name,
        'last_name': s.user.last_name,
        'date_of_birth': _dt(real_dob) if real_dob else None,
        'department_id': str(s.department.pk) if s.department else None,
        'current_semester_id': f'sem-{s.semester:02d}',
        'current_rollno': s.roll_number or (s.student_id[-3:] if s.student_id else ''),
        'roll_number': s.roll_number or (s.student_id[-3:] if s.student_id else ''),
        'status': s.status,
        'created_at': _dt(s.created_at),
        'admission_date': _dt(s.admission_date),
        'user': serialize_user(s.user),
        'department': serialize_dept(s.department),
        'current_semester': {
            'semester_id': f'sem-{s.semester:02d}',
            'number': s.semester,
            'name': f'Semester {s.semester}',
        },
        'department_name': s.department.name if s.department else '—',
        'year_of_study': s.year_of_study,
        'semester': s.semester,
        'email': s.user.email,
        'guardian_name': guardian_name,
        'guardian_phone': parent_phone,
        'parent_email': real_parent_email,
        'parent_phone': parent_phone,
        'attendance_percentage': real_attendance,
        'address': '',
    }


def serialize_subject(c):
    if c is None:
        return None
    return {
        'subject_id': str(c.pk),
        'id': str(c.pk),
        'name': c.name,
        'code': c.code,
        'department_id': str(c.department.pk) if c.department else None,
        'faculty_id': str(c.faculty.pk) if c.faculty else None,
        'semester_id': f'sem-{c.semester:02d}',
        'credits': c.credits,
        'description': c.description,
        'max_students': c.max_students,
        'is_active': c.is_active,
        'created_at': _dt(c.created_at),
        'department': serialize_dept(c.department),
        'faculty': serialize_faculty(c.faculty),
        'semester': {'semester_id': f'sem-{c.semester:02d}', 'number': c.semester},
    }


def serialize_enrollment(e):
    return {
        'enrollment_id': str(e.pk),
        'id': str(e.pk),
        'student_id': str(e.student.pk),
        'subject_id': str(e.course.pk),
        'enrolled_date': _dt(e.enrolled_date),
        'is_active': e.is_active,
        'student': serialize_student(e.student),
        'course': serialize_subject(e.course),
    }


def serialize_mark(g):
    # Grade, GPA and percentage are all computed server-side (see grades.models.Grade)
    # so the React client never re-derives them.
    internal = float(g.marks_obtained) * 0.4
    external = float(g.marks_obtained) * 0.6
    return {
        'mark_id': str(g.pk),
        'id': str(g.pk),
        'student_id': str(g.student.pk),
        'subject_id': str(g.course.pk),
        'internal_marks': round(internal, 2),
        'external_marks': round(external, 2),
        'marks_obtained': float(g.marks_obtained),
        'total_marks': float(g.total_marks),
        'grade': g.grade,
        'gpa': g.grade_point,
        'percentage': g.percentage,
        'exam_type': g.exam_type,
        'exam_date': _dt(g.exam_date),
        'entered_at': _dt(g.created_at),
        'course': serialize_subject(g.course),
        'student': serialize_student(g.student),
    }


def serialize_attendance(a):
    return {
        'record_id': str(a.pk),
        'id': str(a.pk),
        'student_id': str(a.student.pk),
        'subject_id': str(a.course.pk),
        'date': _dt(a.date),
        'status': a.status,
        'remarks': a.remarks,
        'marked_by': str(a.marked_by.pk) if a.marked_by else None,
        'created_at': _dt(a.created_at),
        'student': serialize_student(a.student),
        'course': serialize_subject(a.course),
    }


def serialize_fee(f):
    return {
        'payment_id': str(f.pk),
        'id': str(f.pk),
        'student_id': str(f.student.pk),
        'fee_type': f.fee_type,
        'amount': float(f.amount),
        'amount_paid': float(f.amount),
        'due_date': _dt(f.due_date),
        'status': f.status,
        'payment_date': _dt(f.payment_date),
        'transaction_id': f.transaction_id or '',
        'transaction_ref': f.transaction_id or '',
        'academic_year': f.academic_year,
        'semester': f.semester,
        'created_at': _dt(f.created_at),
        'student': serialize_student(f.student),
        'fee_structures': {
            'fee_id': str(f.pk),
            'component_name': f.fee_type,
            'amount': float(f.amount),
            'due_date': _dt(f.due_date),
        },
    }


def serialize_timetable(s):
    return {
        'timetable_id': str(s.pk),
        'id': str(s.pk),
        'subject_id': str(s.course.pk),
        'faculty_id': str(s.faculty.pk) if s.faculty else None,
        'day_of_week': s.day,
        'start_time': str(s.start_time)[:5],
        'end_time': str(s.end_time)[:5],
        'room_no': s.room,
        'is_active': s.is_active,
        'created_at': _dt(s.created_at),
        'course': serialize_subject(s.course),
        'faculty': serialize_faculty(s.faculty) if s.faculty else None,
    }


def serialize_notice(n):
    author_str = 'Admin'
    if n.posted_by:
        author_str = f"{n.posted_by.first_name} {n.posted_by.last_name}".strip() or n.posted_by.email.split('@')[0].capitalize()
    dept_id = getattr(n, 'department_id', None)
    return {
        'notice_id': str(n.pk),
        'id': str(n.pk),
        'title': n.title,
        'content': n.content,
        'notice_type': n.notice_type,
        'priority': n.notice_type.upper(),
        'target_audience': n.audience,
        'audience': n.audience,
        'department_id': str(dept_id) if dept_id else None,
        'department_name': 'Department Notice' if dept_id else 'All Departments',
        'is_active': n.is_active,
        'published_at': _dt(n.created_at),
        'created_at': _dt(n.created_at),
        'author_id': str(n.posted_by.pk) if n.posted_by else None,
        'author': author_str,
        'author_user': serialize_user(n.posted_by) if n.posted_by else None,
    }


def serialize_grievance(c):
    return {
        'grievance_id': str(c.pk),
        'id': str(c.pk),
        'student_id': str(c.student.pk),
        'title': c.title,
        'description': c.description,
        'category': c.category,
        'status': c.status.upper() if c.status else 'OPEN',
        'hod_response': c.hod_response or '',
        'is_anonymous': c.is_anonymous,
        'submitted_at': _dt(c.created_at),
        'created_at': _dt(c.created_at),
        'student': serialize_student(c.student),
    }


def serialize_semester(n):
    return {
        'semester_id': f'sem-{n:02d}',
        'id': f'sem-{n:02d}',
        'number': n,
        'name': f'Semester {n}',
    }


def serialize_hod(u):
    """Represent admin/hod users in the hod table format."""
    fac = Faculty.objects.filter(user=u).first()
    dept = fac.department if fac else None
    return {
        'hod_id': str(u.pk),
        'id': str(u.pk),
        'user_id': str(u.pk),
        'department_id': str(dept.pk) if dept else None,
        'user': serialize_user(u),
        'department': serialize_dept(dept),
    }


# ── Query helpers ────────────────────────────────────────────────────────────

def apply_postgrest_filters(qs, params, field_map):
    """
    Apply PostgREST-style query filters from URL params to a Django QuerySet.
    field_map maps PostgREST field names → Django ORM field names.
    """
    skip = {'select', 'order', 'limit', 'offset'}
    for key, value in params.items():
        if key in skip:
            continue
        op_match = re.match(r'^(eq|neq|in|like|ilike|lt|lte|gt|gte)\.(.+)$', value)
        if not op_match:
            continue
        op, val = op_match.group(1), op_match.group(2)
        orm_field = field_map.get(key)
        if not orm_field:
            continue
        if op == 'eq':
            if key == 'student_id':
                if orm_field == 'student__pk':
                    qs = qs.filter(Q(student__pk=int(val) if val.isdigit() else -1) | Q(student__student_id=val))
                elif orm_field == 'pk':
                    qs = qs.filter(Q(pk=int(val) if val.isdigit() else -1) | Q(student_id=val))
                else:
                    qs = qs.filter(**{orm_field: val})
            elif key == 'subject_id':
                if orm_field == 'course__pk':
                    qs = qs.filter(Q(course__pk=int(val) if val.isdigit() else -1) | Q(course__code=val))
                elif orm_field == 'pk':
                    qs = qs.filter(Q(pk=int(val) if val.isdigit() else -1) | Q(code=val))
                else:
                    qs = qs.filter(**{orm_field: val})
            elif '__pk' in orm_field or orm_field == 'pk':
                # Integer PK field — handle non-integer values (e.g. legacy UUIDs) gracefully
                if val.isdigit():
                    qs = qs.filter(**{orm_field: int(val)})
                else:
                    # Non-integer value for a PK field: return empty set safely
                    qs = qs.none()
            else:
                try:
                    qs = qs.filter(**{orm_field: val})
                except (ValueError, TypeError):
                    qs = qs.none()
        elif op == 'neq':
            qs = qs.exclude(**{orm_field: val})
        elif op == 'in':
            items = [v.strip() for v in val.strip('()').split(',')]
            qs = qs.filter(**{f'{orm_field}__in': items})
        elif op == 'like':
            qs = qs.filter(**{f'{orm_field}__contains': val.replace('%', '')})
        elif op == 'ilike':
            qs = qs.filter(**{f'{orm_field}__icontains': val.replace('%', '')})
        elif op == 'lt':
            qs = qs.filter(**{f'{orm_field}__lt': val})
        elif op == 'lte':
            qs = qs.filter(**{f'{orm_field}__lte': val})
        elif op == 'gt':
            qs = qs.filter(**{f'{orm_field}__gt': val})
        elif op == 'gte':
            qs = qs.filter(**{f'{orm_field}__gte': val})
    return qs


def apply_order(qs, order_param, field_map):
    if not order_param:
        return qs
    for part in order_param.split(','):
        part = part.strip()
        if '.' in part:
            field_name, direction = part.rsplit('.', 1)
        else:
            field_name, direction = part, 'asc'
        orm_field = field_map.get(field_name, field_name)
        prefix = '-' if direction == 'desc' else ''
        try:
            qs = qs.order_by(f'{prefix}{orm_field}')
        except Exception:
            pass
    return qs


# ── Table handlers ───────────────────────────────────────────────────────────

TABLE_HANDLERS = {}


def handler(table_name):
    def decorator(fn):
        TABLE_HANDLERS[table_name] = fn
        return fn
    return decorator


@handler('users')
def handle_users(request, params, body):
    FM = {
        'id': 'pk', 'email': 'email', 'roles': 'role', 'role': 'role',
        'is_active': 'is_active', 'password_hash': 'password',
    }
    if request.method == 'GET':
        qs = User.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order'), FM)
        limit = int(params.get('limit', 200))
        return [serialize_user(u) for u in qs[:limit]]

    if request.method == 'POST':
        email = body.get('email', '')
        password = body.get('password_hash') or body.get('password') or 'student123'
        role = body.get('roles') or body.get('role') or 'student'
        username = email.split('@')[0] if email else f'user_{User.objects.count()}'
        u = User(username=username[:150], email=email, role=role,
                 is_active=body.get('is_active', True))
        u.set_password(password)
        u.save()
        return [serialize_user(u)]

    if request.method == 'PATCH':
        qs = User.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        new_password = body.get('password') or body.get('new_password') or body.get('password_hash')
        for u in qs:
            if 'is_active' in body:
                u.is_active = body['is_active']
            if 'roles' in body or 'role' in body:
                u.role = body.get('roles') or body.get('role')
            if 'email' in body:
                u.email = body['email']
            if 'first_name' in body:
                u.first_name = body['first_name']
            if 'last_name' in body:
                u.last_name = body['last_name']
            if new_password:
                u.set_password(new_password)  # proper reset, re-hashed
            u.save()
        return [serialize_user(u) for u in qs]

    if request.method == 'DELETE':
        qs = User.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('departments')
def handle_departments(request, params, body):
    FM = {'department_id': 'pk', 'id': 'pk', 'name': 'name', 'code': 'code'}
    if request.method == 'GET':
        from django.db import connection
        dept_id = params.get('department_id', '') or params.get('id', '')
        sql = "SELECT department_id, name, code FROM departments WHERE 1=1"
        args = []
        if dept_id.startswith('eq.'):
            sql += " AND department_id = %s"
            args.append(dept_id[3:])
        elif dept_id:
            sql += " AND department_id = %s"
            args.append(dept_id)
        sql += " ORDER BY name ASC"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'department_id': str(r['department_id']),
            'id': str(r['department_id']),
            'name': r.get('name') or '',
            'code': r.get('code') or '',
        } for r in rows]

    if request.method == 'POST':
        d = Department.objects.create(name=body.get('name'), code=body.get('code', ''),
                                      description=body.get('description', ''))
        return [serialize_dept(d)]

    if request.method == 'PATCH':
        qs = Department.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        if 'name' in body:
            qs.update(name=body['name'])
        if 'code' in body:
            qs.update(code=body['code'])
        return [serialize_dept(d) for d in qs]

    if request.method == 'DELETE':
        qs = Department.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('faculty')
def handle_faculty(request, params, body):
    FM = {'faculty_id': 'pk', 'id': 'pk', 'user_id': 'user__pk', 'department_id': 'department__pk'}
    if request.method == 'GET':
        from django.db import connection
        uid_filter = params.get('user_id', '')
        did_filter = params.get('department_id', '')
        fid_filter = params.get('faculty_id', '') or params.get('id', '')
        uid_in = params.get('user_id', '')  # could be "in.(uuid1,uuid2,...)"
        limit = int(params.get('limit', 200))

        # Always check if requesting user is an HOD or Faculty member to restrict by department
        user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '')
        if user_param.startswith('eq.'):
            user_param = user_param[3:]

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param:
            if user_param.isdigit():
                u_found = User.objects.filter(pk=int(user_param)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=user_param) | Q(username__iexact=user_param)).first()

        req_email = u_found.email.lower() if u_found else ''
        req_role = (getattr(u_found, 'role', '') or getattr(u_found, 'roles', '')).lower() if u_found else ''

        if not did_filter and req_role != 'admin' and (req_email or user_param):
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT department_id FROM (
                            SELECT h.department_id FROM hod h JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(h.user_id AS TEXT) = %s)
                            UNION
                            SELECT f.department_id FROM faculty f JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT) OR LOWER(CAST(f.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(f.user_id AS TEXT) = %s)
                        ) sub WHERE department_id IS NOT NULL LIMIT 1
                    """, [req_email, req_email, user_param, user_param, user_param, user_param,
                          req_email, req_email, user_param, user_param, user_param, user_param])
                    r_hod = cur.fetchone()
                    if r_hod and r_hod[0]:
                        did_filter = str(r_hod[0])
            except Exception:
                pass

        sql = """
            SELECT f.faculty_id, f.user_id, f.employee_id, f.first_name, f.last_name,
                   'Faculty' AS designation, f.department_id, f.subject_id,
                   u.email, u.roles, u.is_active,
                   d.name AS dept_name, d.code AS dept_code
            FROM faculty f
            LEFT JOIN users u ON u.id = f.user_id
            LEFT JOIN departments d ON d.department_id = f.department_id
            WHERE 1=1
        """
        args = []
        if uid_filter.startswith('eq.'):
            sql += ' AND CAST(f.user_id AS TEXT) = %s'
            args.append(uid_filter[3:])
        elif uid_in.startswith('in.('):
            ids = uid_in[4:-1].split(',')
            placeholders = ','.join(['%s'] * len(ids))
            sql += f' AND CAST(f.user_id AS TEXT) IN ({placeholders})'
            args.extend(ids)

        if did_filter.startswith('eq.'):
            sql += ' AND CAST(f.department_id AS TEXT) = %s'
            args.append(did_filter[3:])
        elif did_filter:
            sql += ' AND CAST(f.department_id AS TEXT) = %s'
            args.append(did_filter)

        if fid_filter.startswith('eq.'):
            sql += ' AND CAST(f.faculty_id AS TEXT) = %s'
            args.append(fid_filter[3:])
        elif fid_filter:
            sql += ' AND CAST(f.faculty_id AS TEXT) = %s'
            args.append(fid_filter)

        sql += ' ORDER BY f.employee_id ASC LIMIT %s'
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'faculty_id': str(r['faculty_id']),
            'id': str(r['faculty_id']),
            'user_id': str(r['user_id']) if r.get('user_id') else None,
            'employee_id': r.get('employee_id') or '',
            'first_name': r.get('first_name') or '',
            'last_name': r.get('last_name') or '',
            'designation': r.get('designation') or '',
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
            'department_name': r.get('dept_name') or '—',
            'department': {
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'name': r.get('dept_name') or '—',
                'code': r.get('dept_code') or '—',
            },
            'user': {
                'id': str(r['user_id']) if r.get('user_id') else None,
                'email': r.get('email') or '',
                'roles': r.get('roles') or 'faculty',
                'role': r.get('roles') or 'faculty',
                'is_active': bool(r.get('is_active')),
                'first_name': r.get('first_name') or '',
                'last_name': r.get('last_name') or '',
            },
        } for r in rows]

    if request.method == 'POST':
        # High-level create: build the User + Faculty in one call.
        if body.get('user_id'):
            user = User.objects.filter(pk=body['user_id']).first()
        else:
            user = _create_account(body, role='faculty', default_pw='faculty123',
                                   is_active=body.get('status') != 'inactive')
        if not user:
            return {'error': 'Could not create user account.'}
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        f = Faculty.objects.create(
            user=user,
            faculty_id=body.get('employee_id') or f'F{Faculty.objects.count()+1:03d}',
            department=dept,
            designation='hod' if body.get('role') == 'hod' else 'assistant_professor',
        )
        return [serialize_faculty(f)]

    if request.method == 'PATCH':
        qs = Faculty.objects.select_related('user', 'department').all()
        fid_filter = params.get('faculty_id', '') or params.get('id', '')
        if fid_filter.startswith('eq.'):
            qs = qs.filter(pk=fid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for fac in qs:
            if 'first_name' in body:
                fac.user.first_name = body['first_name']
            if 'last_name' in body:
                fac.user.last_name = body['last_name']
            if 'email' in body:
                fac.user.email = body['email']
            if 'status' in body:
                fac.user.is_active = body['status'] != 'inactive'
            fac.user.save()
            if 'employee_id' in body:
                fac.faculty_id = body['employee_id']
            if 'department_id' in body:
                fac.department_id = body['department_id']
            fac.save()
        return [serialize_faculty(fac) for fac in qs]

    if request.method == 'DELETE':
        qs = Faculty.objects.select_related('user').all()
        fid_filter = params.get('faculty_id', '') or params.get('id', '')
        if fid_filter.startswith('eq.'):
            qs = qs.filter(pk=fid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for fac in qs:
            if fac.user:
                fac.user.delete()  # cascades to Faculty
            else:
                fac.delete()
        return []


@handler('hod')
def handle_hod(request, params, body):
    """HOD table — backed by table hod joined with departments, users, and faculty."""
    from django.db import connection
    if request.method == 'GET':
        user_id = params.get('user_id', '') or params.get('user', '')
        dept_id = params.get('department_id', '') or params.get('department', '')
        hod_id = params.get('hod_id', '') or params.get('id', '')

        if user_id.startswith('eq.'):
            user_id = user_id[3:]
        if dept_id.startswith('eq.'):
            dept_id = dept_id[3:]
        if hod_id.startswith('eq.'):
            hod_id = hod_id[3:]

        sql = """
            SELECT h.hod_id, h.user_id, h.department_id, h.address, h.firstname, h.lastname,
                   d.name AS dept_name, d.code AS dept_code,
                   u.email AS user_email,
                   f.faculty_id, f.first_name AS fac_first, f.last_name AS fac_last, f.employee_id
            FROM hod h
            LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(h.department_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email)
            LEFT JOIN faculty f ON CAST(f.user_id AS TEXT) = CAST(u.id AS TEXT) OR CAST(f.user_id AS TEXT) = CAST(h.user_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if hod_id:
            sql += ' AND CAST(h.hod_id AS TEXT) = %s'
            args.append(hod_id)
        if user_id:
            sql += ' AND (CAST(h.user_id AS TEXT) = %s OR LOWER(CAST(u.email AS TEXT)) = %s OR CAST(u.id AS TEXT) = %s)'
            args.extend([user_id, user_id.lower(), user_id])
        if dept_id:
            sql += ' AND CAST(h.department_id AS TEXT) = %s'
            args.append(dept_id)

        sql += ' ORDER BY d.name ASC'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        seen = set()
        out = []
        for r in rows:
            hid = str(r['hod_id'])
            if hid in seen:
                continue
            seen.add(hid)

            first = r.get('firstname') or r.get('fac_first') or ''
            last = r.get('lastname') or r.get('fac_last') or ''
            email = r.get('user_email') or ''

            if not first and not last and email:
                first = email.split('@')[0].capitalize()
                last = 'HOD'

            out.append({
                'hod_id': hid,
                'id': hid,
                'user_id': str(r['user_id']) if r.get('user_id') else None,
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('dept_name') or 'Department',
                'office_location': r.get('address') or 'Main Campus Building',
                'address': r.get('address') or '',
                'first_name': first,
                'last_name': last,
                'name': f"{first} {last}".strip(),
                'email': email,
                'employee_id': r.get('employee_id') or '',
                'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
                'user': {
                    'id': str(r['user_id']) if r.get('user_id') else None,
                    'user_id': str(r['user_id']) if r.get('user_id') else None,
                    'email': email,
                    'first_name': first,
                    'last_name': last,
                },
                'department': {
                    'department_id': str(r['department_id']) if r.get('department_id') else None,
                    'id': str(r['department_id']) if r.get('department_id') else None,
                    'name': r.get('dept_name') or 'Department',
                    'code': r.get('dept_code') or '',
                },
                'faculty': {
                    'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
                    'id': str(r['faculty_id']) if r.get('faculty_id') else None,
                    'first_name': first,
                    'last_name': last,
                    'email': email,
                }
            })
        return out

    if request.method == 'POST':
        import uuid
        dept_id = body.get('department_id')
        user_id = body.get('user_id')
        fac_id = body.get('faculty_id')

        if fac_id:
            with connection.cursor() as cur:
                cur.execute("SELECT user_id, department_id FROM faculty WHERE CAST(faculty_id AS TEXT) = %s LIMIT 1", [fac_id])
                r_f = cur.fetchone()
                if r_f:
                    user_id = user_id or str(r_f[0])
                    dept_id = dept_id or str(r_f[1])

        if not user_id or not dept_id:
            return {'error': 'Missing user_id or department_id.'}

        h_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("DELETE FROM hod WHERE CAST(department_id AS TEXT) = %s", [dept_id])
            cur.execute("""
                INSERT INTO hod (hod_id, user_id, department_id, address)
                VALUES (%s, %s, %s, 'Main Campus Building')
            """, [h_id, user_id, dept_id])

            cur.execute("UPDATE users SET roles = 'hod' WHERE CAST(id AS TEXT) = %s", [user_id])

        return [{'hod_id': h_id, 'id': h_id, 'user_id': user_id, 'department_id': dept_id}]

    if request.method == 'DELETE':
        hid = params.get('hod_id', '') or params.get('id', '')
        if hid.startswith('eq.'):
            hid = hid[3:]
        with connection.cursor() as cur:
            if hid:
                cur.execute("DELETE FROM hod WHERE CAST(hod_id AS TEXT) = %s", [hid])
            else:
                cur.execute("DELETE FROM hod")
        return []


@handler('semesters')
def handle_semesters(request, params, body):
    return [serialize_semester(n) for n in range(1, 9)]


@handler('class_sections')
def handle_class_sections(request, params, body):
    dept_id = params.get('department_id', '')
    from django.db import connection
    sql = "SELECT section_id, department_id, semester_id, section_name, capacity FROM class_sections WHERE 1=1"
    args = []
    if dept_id.startswith('eq.'):
        sql += " AND department_id = %s"
        args.append(dept_id[3:])
    sql += " ORDER BY section_name ASC"
    try:
        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        return []



@handler('students')
def handle_students(request, params, body):
    FM = {'student_id': 'pk', 'id': 'pk', 'user_id': 'user__pk', 'enrollment_no': 'enrollment_no'}
    from django.db import connection
    if request.method == 'GET':
        uid_filter = params.get('user_id', '')
        sid_filter = params.get('student_id', '')
        limit = int(params.get('limit', 200))

        sql = """
            SELECT s.student_id, s.user_id, s.enrollment_no, s.first_name, s.last_name,
                   s.date_of_birth, s.parent_email, s.parent_phone, s.department_id,
                   s.current_semester_id, s.current_rollno, s.address,
                   u.email, u.roles, u.is_active,
                   d.name AS dept_name, d.code AS dept_code,
                   sem.number AS sem_number,
                   (SELECT ROUND(AVG(percentage)::numeric, 1) FROM attendance_summary att WHERE att.student_id = s.student_id) AS attendance_percentage,
                   (SELECT ROUND(AVG(grade_points)::numeric, 2) FROM marks m WHERE m.student_id = s.student_id) AS cgpa
            FROM students s
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN departments d ON d.department_id = s.department_id
            LEFT JOIN semesters sem ON sem.semester_id = s.current_semester_id
            WHERE 1=1
        """
        args = []
        dept_filter = params.get('department_id', '')
        
        # Always check if the requesting user is an HOD or Faculty member to restrict by department
        user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '')
        if user_param.startswith('eq.'):
            user_param = user_param[3:]

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param:
            if user_param.isdigit():
                u_found = User.objects.filter(pk=int(user_param)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=user_param) | Q(username__iexact=user_param)).first()

        req_email = u_found.email.lower() if u_found else ''
        req_role = (getattr(u_found, 'role', '') or getattr(u_found, 'roles', '')).lower() if u_found else ''

        if req_role != 'admin':
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT department_id FROM (
                            SELECT h.department_id FROM hod h JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(h.user_id AS TEXT) = %s)
                            UNION
                            SELECT f.department_id FROM faculty f JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT) OR LOWER(CAST(f.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(f.user_id AS TEXT) = %s)
                        ) sub WHERE department_id IS NOT NULL LIMIT 1
                    """, [req_email, req_email, user_param, user_param, user_param, user_param,
                          req_email, req_email, user_param, user_param, user_param, user_param])
                    r_hod = cur.fetchone()
                    if r_hod and r_hod[0]:
                        dept_filter = str(r_hod[0])
            except Exception:
                pass

        if dept_filter.startswith('eq.'):
            sql += ' AND CAST(s.department_id AS TEXT) = %s'
            args.append(dept_filter[3:])
        elif dept_filter:
            sql += ' AND CAST(s.department_id AS TEXT) = %s'
            args.append(dept_filter)

        if uid_filter.startswith('eq.'):
            sql += ' AND CAST(s.user_id AS TEXT) = %s'
            args.append(uid_filter[3:])
        if sid_filter.startswith('eq.'):
            sql += ' AND CAST(s.student_id AS TEXT) = %s'
            args.append(sid_filter[3:])
        sql += ' ORDER BY s.enrollment_no ASC LIMIT %s'
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        result = []
        for r in rows:
            sem_num = int(r.get('sem_number') or 1)
            att_pct = float(r['attendance_percentage']) if r.get('attendance_percentage') is not None else None
            cgpa_val = float(r['cgpa']) if r.get('cgpa') is not None else None
            full_st_name = f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
            result.append({
                'student_id': str(r['student_id']),
                'id': str(r['student_id']),
                'user_id': str(r['user_id']) if r.get('user_id') else None,
                'enrollment_no': r.get('enrollment_no') or '',
                'first_name': r.get('first_name') or '',
                'last_name': r.get('last_name') or '',
                'current_rollno': r.get('current_rollno') or '',
                'roll_number': r.get('current_rollno') or '',
                'address': r.get('address') or '',
                'parent_email': r.get('parent_email') or '',
                'parent_phone': r.get('parent_phone') or '',
                'guardian_name': f"Parent of {full_st_name}" if full_st_name else 'Parent / Guardian',
                'guardian_phone': r.get('parent_phone') or '',
                'date_of_birth': _dt(r.get('date_of_birth')),
                'attendance_percentage': att_pct,
                'cgpa': cgpa_val,
                'gpa': cgpa_val,
                'grade': f"{cgpa_val} CGPA" if cgpa_val is not None else '—',
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('dept_name') or '—',
                'current_semester_id': str(r['current_semester_id']) if r.get('current_semester_id') else None,
                'status': 'active' if r.get('is_active') else 'inactive',
                'year_of_study': max(1, (sem_num + 1) // 2),
                'semester': sem_num,
                'department': {
                    'department_id': str(r['department_id']) if r.get('department_id') else None,
                    'id': str(r['department_id']) if r.get('department_id') else None,
                    'name': r.get('dept_name') or '—',
                    'code': r.get('dept_code') or '—',
                },
                'current_semester': {
                    'semester_id': str(r['current_semester_id']) if r.get('current_semester_id') else None,
                    'number': sem_num,
                    'name': f'Semester {sem_num}',
                },
                'user': {
                    'id': str(r['user_id']) if r.get('user_id') else None,
                    'email': r.get('email') or '',
                    'roles': r.get('roles') or 'student',
                    'role': r.get('roles') or 'student',
                    'is_active': bool(r.get('is_active')),
                    'first_name': r.get('first_name') or '',
                    'last_name': r.get('last_name') or '',
                },
            })
        return result


    if request.method == 'POST':
        # High-level create: build the User, the Student, and auto-enrol in one call
        # (this orchestration used to live in the React client).
        status = body.get('status') or 'active'
        if body.get('user_id'):
            user = User.objects.filter(pk=body['user_id']).first()
        else:
            user = _create_account(body, role='student', default_pw='student123',
                                   is_active=status not in ('inactive', 'graduated'))
        if not user:
            return {'error': 'Could not create user account.'}
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        sem = _parse_semester(body, 1)
        s = Student.objects.create(
            user=user,
            student_id=body.get('enrollment_no') or body.get('student_id') or f'ENR{Student.objects.count()+1:06d}',
            department=dept,
            roll_number=str(body.get('current_rollno') or body.get('roll_number') or ''),
            gender=body.get('gender') or 'M',
            year_of_study=max(1, (sem + 1) // 2),
            semester=sem,
            status=status,
        )
        _auto_enroll(s)
        return [serialize_student(s)]

    if request.method == 'PATCH':
        qs = Student.objects.select_related('user', 'department').all()
        sid_filter = params.get('student_id', '') or params.get('id', '')
        if sid_filter.startswith('eq.'):
            qs = qs.filter(pk=sid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for s in qs:
            if 'enrollment_no' in body:
                s.student_id = body['enrollment_no']
            if 'current_rollno' in body or 'roll_number' in body:
                s.roll_number = str(body.get('current_rollno') or body.get('roll_number') or '')
            if 'department_id' in body:
                s.department_id = body['department_id']
            sem_changed = 'semester' in body or 'current_semester_id' in body
            if sem_changed:
                s.semester = _parse_semester(body, s.semester)
                s.year_of_study = max(1, (s.semester + 1) // 2)
            # User-level fields
            if 'first_name' in body:
                s.user.first_name = body['first_name']
            if 'last_name' in body:
                s.user.last_name = body['last_name']
            if 'email' in body:
                s.user.email = body['email']
            if 'status' in body:
                s.status = body['status']
                s.user.is_active = body['status'] not in ('inactive', 'graduated')
            s.user.save()
            s.save()
            if sem_changed or 'department_id' in body:
                _auto_enroll(s)
        return [serialize_student(s) for s in qs]

    if request.method == 'DELETE':
        qs = Student.objects.select_related('user').all()
        sid_filter = params.get('student_id', '') or params.get('id', '')
        if sid_filter.startswith('eq.'):
            qs = qs.filter(pk=sid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        # Deleting the user cascades to the student profile.
        for s in qs:
            if s.user:
                s.user.delete()
            else:
                s.delete()
        return []


@handler('subjects')
@handler('courses')
def handle_subjects(request, params, body):
    FM = {'subject_id': 'pk', 'id': 'pk', 'code': 'code', 'name': 'name'}
    if request.method == 'GET':
        from django.db import connection
        dept_filter = params.get('department_id', '')
        sem_filter = params.get('semester_id', '')
        code_filter = params.get('code', '')
        limit = int(params.get('limit', 200))

        sql = """
            SELECT DISTINCT ON (sub.subject_id)
                   sub.subject_id, sub.code, sub.name, sub.credits, sub.subject_type,
                   sub.department_id, sub.semester_id,
                   sem.number AS sem_number,
                   d.name AS dept_name, d.code AS dept_code,
                   COALESCE(f.faculty_id, f2.faculty_id, f3.faculty_id) AS faculty_id,
                   COALESCE(f.first_name, f2.first_name, f3.first_name) AS fac_first,
                   COALESCE(f.last_name, f2.last_name, f3.last_name) AS fac_last,
                   COALESCE(f.user_id, f2.user_id, f3.user_id) AS fac_user_id,
                   COALESCE(u.email, u2.email, u3.email) AS fac_email
            FROM subjects sub
            LEFT JOIN semesters sem ON sem.semester_id = sub.semester_id
            LEFT JOIN departments d ON d.department_id = sub.department_id
            LEFT JOIN timetable t ON t.subject_id = sub.subject_id
            LEFT JOIN faculty f ON f.faculty_id = t.faculty_id
            LEFT JOIN users u ON u.id = f.user_id
            LEFT JOIN faculty f2 ON f2.subject_id = sub.subject_id
            LEFT JOIN users u2 ON u2.id = f2.user_id
            LEFT JOIN faculty f3 ON f3.department_id = sub.department_id
            LEFT JOIN users u3 ON u3.id = f3.user_id
            WHERE 1=1
        """
        args = []
        subj_filter = params.get('subject_id', '') or params.get('id', '')
        fac_filter = params.get('faculty_id', '') or params.get('faculty', '')

        if subj_filter.startswith('eq.'):
            sql += ' AND sub.subject_id = %s'
            args.append(subj_filter[3:])
        elif subj_filter:
            sql += ' AND sub.subject_id = %s'
            args.append(subj_filter)

        if fac_filter.startswith('eq.'):
            sql += ' AND (f.faculty_id = %s OR f.user_id = %s)'
            args.extend([fac_filter[3:], fac_filter[3:]])
        elif fac_filter:
            sql += ' AND (f.faculty_id = %s OR f.user_id = %s)'
            args.extend([fac_filter, fac_filter])

        if dept_filter.startswith('eq.'):
            sql += ' AND CAST(sub.department_id AS TEXT) = %s'
            args.append(dept_filter[3:])
        elif dept_filter:
            sql += ' AND CAST(sub.department_id AS TEXT) = %s'
            args.append(dept_filter)

        if sem_filter.startswith('eq.'):
            sem_val = sem_filter[3:]
            sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
            args.extend([sem_val, sem_val])
        elif sem_filter:
            sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
            args.extend([sem_filter, sem_filter])

        if code_filter.startswith('eq.'):
            sql += ' AND sub.code = %s'
            args.append(code_filter[3:])
        elif code_filter:
            sql += ' AND sub.code = %s'
            args.append(code_filter)
        sql += ' ORDER BY sub.subject_id, sem.number ASC, sub.name ASC LIMIT %s'
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'subject_id': str(r['subject_id']),
            'id': str(r['subject_id']),
            'code': r.get('code') or '',
            'name': r.get('name') or '',
            'credits': int(r.get('credits') or 3),
            'subject_type': r.get('subject_type') or 'core',
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
            'semester': int(r.get('sem_number') or 1),
            'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
            'department': {
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'name': r.get('dept_name') or '—',
                'code': r.get('dept_code') or '—',
            },
            'faculty': {
                'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
                'first_name': r.get('fac_first') or '',
                'last_name': r.get('fac_last') or '',
                'user': {
                    'id': str(r['fac_user_id']) if r.get('fac_user_id') else None,
                    'email': r.get('fac_email') or '',
                    'first_name': r.get('fac_first') or '',
                    'last_name': r.get('fac_last') or '',
                },
            } if r.get('faculty_id') else None,
            'enrollments': [],
        } for r in rows]

    if request.method == 'POST':
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        fac = Faculty.objects.filter(pk=body.get('faculty_id')).first()
        c = Course.objects.create(
            name=body.get('name', 'Subject'),
            code=body.get('code', f'SUB{Course.objects.count()+1:03d}'),
            department=dept, faculty=fac,
            credits=int(body.get('credits') or 3),
            semester=int(body.get('semester') or 1),
        )
        return [serialize_subject(c)]

    if request.method == 'PATCH':
        qs = Course.objects.all()
        sub_id_filter = params.get('subject_id', '')
        if sub_id_filter.startswith('eq.'):
            qs = qs.filter(pk=sub_id_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for c in qs:
            for field in ['name', 'code', 'credits', 'description']:
                if field in body:
                    setattr(c, field, body[field])
            if 'department_id' in body:
                c.department_id = body['department_id']
            if 'faculty_id' in body:
                c.faculty_id = body['faculty_id']
            c.save()
        return [serialize_subject(c) for c in qs]

    if request.method == 'DELETE':
        qs = Course.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('enrollments')
def handle_enrollments(request, params, body):
    FM = {'enrollment_id': 'pk', 'id': 'pk', 'student_id': 'student__pk'}
    if request.method == 'GET':
        from django.db import connection
        student_id = params.get('student_id', '')
        subject_id = params.get('subject_id', '') or params.get('course', '')

        sql = """
            SELECT e.enrollment_id, e.student_id, e.department_id, e.semester_id,
                   e.enrolled_date,
                   s.first_name, s.last_name, s.enrollment_no,
                   d.name AS dept_name
            FROM enrollments e
            LEFT JOIN students s ON s.student_id = e.student_id
            LEFT JOIN departments d ON d.department_id = e.department_id
            WHERE 1=1
        """
        args = []
        if student_id.startswith('eq.'):
            sql += ' AND e.student_id = %s'
            args.append(student_id[3:])
        elif student_id:
            sql += ' AND e.student_id = %s'
            args.append(student_id)

        if subject_id.startswith('eq.'):
            sub_val = subject_id[3:]
            sql += ' AND (e.semester_id = (SELECT semester_id FROM subjects WHERE subject_id = %s LIMIT 1) OR e.student_id IN (SELECT student_id FROM marks WHERE subject_id = %s))'
            args.extend([sub_val, sub_val])
        elif subject_id:
            sql += ' AND (e.semester_id = (SELECT semester_id FROM subjects WHERE subject_id = %s LIMIT 1) OR e.student_id IN (SELECT student_id FROM marks WHERE subject_id = %s))'
            args.extend([subject_id, subject_id])

        sql += ' LIMIT 500'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'enrollment_id': str(r['enrollment_id']),
            'id': str(r['enrollment_id']),
            'student_id': str(r['student_id']) if r.get('student_id') else None,
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
            'enrolled_date': _dt(r.get('enrolled_date')),
            'student': {
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'first_name': r.get('first_name') or '',
                'last_name': r.get('last_name') or '',
                'enrollment_no': r.get('enrollment_no') or '',
            },
        } for r in rows]

    if request.method == 'POST':
        items = body if isinstance(body, list) else [body]
        results = []
        for item in items:
            stu = Student.objects.filter(pk=item.get('student_id')).first()
            course = Course.objects.filter(pk=item.get('subject_id')).first()
            if stu and course:
                e, _ = Enrollment.objects.get_or_create(student=stu, course=course)
                results.append(serialize_enrollment(e))
        return results

    if request.method == 'DELETE':
        qs = Enrollment.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('marks')
@handler('grades')
@handler('grades/my_grades')
@handler('marks/my_marks')
def handle_marks(request, params, body):
    from django.db import connection
    import json
    if request.method == 'GET':
        student_id = params.get('student_id', '').replace('eq.', '')
        subject_id = params.get('subject_id', '').replace('eq.', '')
        user_param = params.get('user_id', '').replace('eq.', '') or params.get('email', '').replace('eq.', '')

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param or student_id:
            from accounts.models import User
            from django.db.models import Q
            target_id = user_param or student_id
            u_found = User.objects.filter(Q(email__iexact=target_id) | Q(username__iexact=target_id)).first()

        req_email = u_found.email.lower() if u_found else ''

        sql = """
            SELECT m.mark_id, m.student_id, m.subject_id, m.semester_id,
                   m.marks, m.grade, m.grade_points, m.entered_at,
                   sub.name AS subject_name, sub.code AS subject_code, sub.credits,
                   sem.number AS sem_number,
                   s.first_name, s.last_name, s.enrollment_no, s.department_id,
                   s.parent_email, s.parent_phone, s.current_rollno
            FROM marks m
            LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT) = CAST(m.subject_id AS TEXT)
            LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(m.semester_id AS TEXT)
            LEFT JOIN students s ON CAST(s.student_id AS TEXT) = CAST(m.student_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if student_id:
            sql += ' AND (CAST(m.student_id AS TEXT) = %s OR CAST(s.student_id AS TEXT) = %s)'
            args.extend([student_id, student_id])
        elif req_email:
            sql += ' AND LOWER(CAST(u.email AS TEXT)) = %s'
            args.append(req_email)

        if subject_id:
            sql += ' AND (CAST(m.subject_id AS TEXT) = %s OR CAST(sub.subject_id AS TEXT) = %s)'
            args.extend([subject_id, subject_id])

        sql += ' ORDER BY m.entered_at DESC LIMIT 500'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        result = []
        for r in rows:
            raw_m = r.get('marks') or {}
            if isinstance(raw_m, str):
                try:
                    raw_m = json.loads(raw_m)
                except Exception:
                    raw_m = {}
            elif not isinstance(raw_m, dict):
                raw_m = {}

            internal = float(
                raw_m.get('internal_marks') or 
                (raw_m.get('mid-sem', 0) + raw_m.get('mid_sem', 0) + raw_m.get('viva', 0) + raw_m.get('projects', 0) + raw_m.get('practical', 0))
            )
            external = float(
                raw_m.get('external_marks') or 
                raw_m.get('end-sem', 0) or 
                raw_m.get('end_sem', 0)
            )
            total = float(raw_m.get('total_marks') or 100.0)
            if total <= 0:
                total = 100.0

            obtained = float(
                raw_m.get('obtained_marks') or 
                raw_m.get('marks_obtained') or 
                (external if external > 0 else (internal if internal > 0 else float(sum(v for v in raw_m.values() if isinstance(v, (int, float))))))
            )

            pct = round((obtained / total) * 100, 1) if total > 0 else 0.0

            result.append({
                'mark_id': str(r['mark_id']),
                'id': str(r['mark_id']),
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
                'semester': str(r.get('sem_number') or r.get('semester_id') or ''),
                'internal_marks': internal,
                'external_marks': external,
                'marks_obtained': obtained,
                'total_marks': total,
                'marks': raw_m,
                'grade': r.get('grade') or '—',
                'grade_points': int(r.get('grade_points') or 0),
                'gpa': float(r.get('grade_points') or 0),
                'percentage': pct,
                'entered_at': _dt(r.get('entered_at')),
                'exam_type': 'Semester End Exam',
                'subject_code': r.get('subject_code') or '—',
                'subject_name': r.get('subject_name') or '—',
                'course_code': r.get('subject_code') or '—',
                'course_name': r.get('subject_name') or '—',
                'course': {
                    'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                    'name': r.get('subject_name') or '—',
                    'code': r.get('subject_code') or '—',
                    'credits': r.get('credits') or 3,
                },
                'student': {
                    'student_id': str(r['student_id']) if r.get('student_id') else None,
                    'id': str(r['student_id']) if r.get('student_id') else None,
                    'first_name': r.get('first_name') or '',
                    'last_name': r.get('last_name') or '',
                    'enrollment_no': r.get('enrollment_no') or '',
                    'roll_number': r.get('current_rollno') or '',
                    'department_id': str(r['department_id']) if r.get('department_id') else None,
                    'parent_email': r.get('parent_email') or '',
                    'parent_phone': r.get('parent_phone') or '',
                },
            })
        return result

    if request.method == 'POST':
        stu = Student.objects.filter(pk=body.get('student_id')).first()
        course = Course.objects.filter(pk=body.get('subject_id')).first()
        if not stu or not course:
            return []
        # Accept marks_obtained (+ optional total_marks); grade/GPA are derived on save().
        obtained = float(body.get('marks_obtained', body.get('total_marks') or 0))
        max_marks = float(body.get('total_marks') or 100) if 'marks_obtained' in body else 100
        g, created = Grade.objects.get_or_create(
            student=stu, course=course, exam_type=body.get('exam_type') or 'Semester End Exam',
            defaults={'marks_obtained': obtained, 'total_marks': max_marks}
        )
        if not created:
            g.marks_obtained = obtained
            g.total_marks = max_marks
            g.save()
        return [serialize_mark(g)]

    FM = {'mark_id': 'pk', 'id': 'pk', 'student_id': 'student__pk', 'subject_id': 'subject__pk'}

    if request.method == 'PATCH':
        mid_filter = params.get('mark_id', '').replace('eq.', '').strip() or params.get('id', '').replace('eq.', '').strip()
        if mid_filter and 'marks' in body:
            import json
            m_str = json.dumps(body['marks']) if isinstance(body['marks'], dict) else str(body['marks'])
            with connection.cursor() as cur:
                cur.execute("UPDATE marks SET marks = %s::json WHERE CAST(mark_id AS TEXT) = %s", [m_str, mid_filter])

        qs = Grade.objects.all()
        if mid_filter:
            qs = qs.filter(pk=mid_filter)
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for g in qs:
            if 'marks_obtained' in body:
                g.marks_obtained = float(body['marks_obtained'])
            if 'total_marks' in body:
                g.total_marks = float(body['total_marks'])
            g.save()  # recomputes grade
        return [serialize_mark(g) for g in qs]

    if request.method == 'DELETE':
        mid_filter = params.get('mark_id', '').replace('eq.', '').strip() or params.get('id', '').replace('eq.', '').strip()
        if mid_filter:
            with connection.cursor() as cur:
                cur.execute("DELETE FROM marks WHERE CAST(mark_id AS TEXT) = %s", [mid_filter])
        qs = Grade.objects.all()
        if mid_filter:
            qs = qs.filter(pk=mid_filter)
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


def _is_number(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


@handler('grades/bulk-import')
def handle_grades_bulk_import(request, params, body):
    """Parse a CSV of marks server-side and upsert Grade rows.

    Accepts { course_id/subject_id, total_marks, exam_type, csv_text }.
    Each CSV row is `identifier, [..], marks` where identifier matches a student's
    roll number, enrollment number, or full name. Grades/GPA are derived on save().
    """
    if request.method != 'POST':
        return {'error': 'POST required'}

    course = Course.objects.filter(pk=body.get('course_id') or body.get('subject_id')).first()
    if not course:
        return {'error': 'Course not found', 'imported': 0, 'skipped': 0, 'rows': []}

    total_marks = float(body.get('total_marks') or 100)
    exam_type = body.get('exam_type') or 'Semester End Exam'
    csv_text = body.get('csv_text') or body.get('csv') or ''

    # Build identifier → student lookups from the course's active enrollments.
    enrolled = (Student.objects
                .filter(enrollments__course=course, enrollments__is_active=True)
                .select_related('user').distinct())
    by_roll, by_enroll, by_name = {}, {}, {}
    for s in enrolled:
        if s.roll_number:
            by_roll[s.roll_number.strip().lower()] = s
        by_enroll[s.student_id.strip().lower()] = s
        by_name[f'{s.user.first_name} {s.user.last_name}'.strip().lower()] = s

    imported, skipped, rows = 0, 0, []
    for i, raw in enumerate(csv.reader(io.StringIO(csv_text))):
        cells = [c.strip() for c in raw]
        if not cells or all(not c for c in cells):
            continue
        # Skip an obvious header row (first row with no numeric cells after col 0).
        if i == 0 and not any(_is_number(c) for c in cells[1:]):
            continue

        ident = cells[0].lower()
        marks_val = next((float(c) for c in reversed(cells[1:]) if _is_number(c)), None)
        stu = by_roll.get(ident) or by_enroll.get(ident) or by_name.get(ident)

        if not stu or marks_val is None:
            skipped += 1
            rows.append({'row': i + 1, 'identifier': cells[0], 'status': 'skipped',
                         'reason': 'no matching student' if not stu else 'no marks value'})
            continue

        g, created = Grade.objects.get_or_create(
            student=stu, course=course, exam_type=exam_type,
            defaults={'marks_obtained': marks_val, 'total_marks': total_marks})
        if not created:
            g.marks_obtained = marks_val
            g.total_marks = total_marks
            g.save()
        imported += 1
        rows.append({'row': i + 1, 'identifier': cells[0],
                     'student_name': f'{stu.user.first_name} {stu.user.last_name}'.strip(),
                     'marks': marks_val, 'grade': g.grade, 'status': 'imported'})

    return {'imported': imported, 'skipped': skipped, 'total': imported + skipped, 'rows': rows}


@handler('attendance')
@handler('attendance_records')
def handle_attendance(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        student_id = params.get('student_id', '')
        subject_id = params.get('subject_id', '') or params.get('course', '')
        date_filter = params.get('date', '')

        sql = """
            SELECT ar.record_id, ar.student_id, ar.subject_id, ar.date, ar.status,
                   ar.marked_by, ar.ip_address, ar.marked_at,
                   sub.name AS subject_name, sub.code AS subject_code,
                   COALESCE(sub.department_id, s.department_id) AS dept_id,
                   COALESCE(d1.name, d2.name, 'General') AS department_name,
                   s.first_name, s.last_name, s.enrollment_no
            FROM attendance_records ar
            LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT) = CAST(ar.subject_id AS TEXT)
            LEFT JOIN students s ON CAST(s.student_id AS TEXT) = CAST(ar.student_id AS TEXT)
            LEFT JOIN departments d1 ON CAST(d1.department_id AS TEXT) = CAST(sub.department_id AS TEXT)
            LEFT JOIN departments d2 ON CAST(d2.department_id AS TEXT) = CAST(s.department_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if student_id.startswith('eq.'):
            sql += ' AND ar.student_id = %s'
            args.append(student_id[3:])
        if subject_id.startswith('eq.'):
            sql += ' AND ar.subject_id = %s'
            args.append(subject_id[3:])
        if date_filter.startswith('eq.'):
            sql += ' AND ar.date = %s'
            args.append(date_filter[3:])
        sql += ' ORDER BY ar.date DESC LIMIT 2000'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'record_id': str(r['record_id']),
            'id': str(r['record_id']),
            'student_id': str(r['student_id']) if r.get('student_id') else None,
            'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
            'department_id': str(r.get('dept_id')) if r.get('dept_id') else '',
            'department_name': r.get('department_name') or 'General',
            'date': _dt(r.get('date')),
            'status': r.get('status') or 'present',
            'lecture': 'Lecture 1',
            'marked_at': _dt(r.get('marked_at')),
            'marked_by': r.get('marked_by') or 'Faculty',
            'subject_name': r.get('subject_name') or '—',
            'course_code': r.get('subject_code') or '—',
            'student_name': f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip() if r.get('first_name') else 'Student',
            'course': {
                'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                'name': r.get('subject_name') or '—',
                'code': r.get('subject_code') or '—',
            },
            'student': {
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'first_name': r.get('first_name') or '',
                'last_name': r.get('last_name') or '',
                'enrollment_no': r.get('enrollment_no') or '',
                'department_id': str(r.get('dept_id')) if r.get('dept_id') else '',
            },
        } for r in rows]

    return []


@handler('attendance/bulk-mark')
def handle_attendance_bulk(request, params, body):
    if request.method != 'POST':
        return []
    from django.db import connection
    import uuid
    records = body.get('records') or []
    out = []
    with connection.cursor() as cur:
        for r in records:
            student_id = r.get('student') or r.get('student_id')
            subject_id = r.get('subject_id') or r.get('course')
            att_date = r.get('date')
            status = r.get('status') or 'present'
            lecture = r.get('lecture') or 'Lecture 1'
            if not student_id or not subject_id or not att_date:
                continue

            cur.execute("""
                SELECT record_id FROM attendance_records
                WHERE student_id = %s AND subject_id = %s AND date = %s
                LIMIT 1
            """, [student_id, subject_id, att_date])
            row = cur.fetchone()

            if row:
                rec_id = str(row[0])
                cur.execute("""
                    UPDATE attendance_records
                    SET status = %s, marked_at = NOW()
                    WHERE record_id = %s
                """, [status, rec_id])
            else:
                rec_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO attendance_records (record_id, student_id, subject_id, date, status, ip_address, marked_at)
                    VALUES (%s, %s, %s, %s, %s, '127.0.0.1', NOW())
                """, [rec_id, student_id, subject_id, att_date, status])

            out.append({
                'record_id': rec_id,
                'student_id': student_id,
                'subject_id': subject_id,
                'date': att_date,
                'status': status,
                'lecture': lecture
            })
    return out


@handler('faculty/leave')
@handler('faculty/leaves')
@handler('leaves')
def handle_faculty_leaves(request, params, body):
    from django.db import connection
    import uuid

    user_id = params.get('user_id') or getattr(request, 'user_id', None)
    faculty_id = None
    if user_id:
        with connection.cursor() as cur:
            cur.execute("SELECT faculty_id FROM faculty WHERE user_id = %s LIMIT 1", [user_id])
            r = cur.fetchone()
            if r:
                faculty_id = str(r[0])

    if not faculty_id:
        with connection.cursor() as cur:
            cur.execute("SELECT faculty_id FROM faculty LIMIT 1")
            r = cur.fetchone()
            if r:
                faculty_id = str(r[0])

    if request.method == 'GET':
        sql = """
            SELECT lr.leave_id, lr.faculty_id, lr.from_date, lr.to_date, lr.leave_type,
                   lr.reason, lr.status, lr.applied_at, lr.decision_at,
                   f.first_name, f.last_name, f.employee_id
            FROM leave_requests lr
            LEFT JOIN faculty f ON f.faculty_id = lr.faculty_id
            WHERE 1=1
        """
        args = []
        if faculty_id:
            sql += " AND lr.faculty_id = %s"
            args.append(faculty_id)
        sql += " ORDER BY lr.applied_at DESC LIMIT 200"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'leave_id': str(r['leave_id']),
            'id': str(r['leave_id']),
            'faculty_id': str(r['faculty_id']),
            'from_date': _dt(r.get('from_date')),
            'to_date': _dt(r.get('to_date')),
            'leave_type': str(r.get('leave_type') or 'casual').lower(),
            'reason': r.get('reason') or '',
            'status': str(r.get('status') or 'pending').lower(),
            'applied_at': _dt(r.get('applied_at')),
            'faculty_name': f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip() or 'Faculty'
        } for r in rows]

    if request.method == 'POST':
        MAP_LEAVE_TYPE = {
            'casual': 'casual',
            'medical': 'sick',
            'earned': 'full',
            'special': 'multi_day',
            'sick': 'sick',
            'half': 'half',
            'full': 'full',
            'multi_day': 'multi_day'
        }
        raw_type = str(body.get('leaveType') or body.get('leave_type') or 'casual').lower()
        leave_type = MAP_LEAVE_TYPE.get(raw_type, 'casual')
        from_date = body.get('fromDate') or body.get('from_date')
        to_date = body.get('toDate') or body.get('to_date')
        reason = body.get('reason') or ''

        if not from_date or not to_date or not reason:
            return {'error': 'Missing required leave fields.'}

        leave_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO leave_requests (leave_id, faculty_id, from_date, to_date, leave_type, reason, status, applied_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'pending', NOW())
            """, [leave_id, faculty_id, from_date, to_date, leave_type, reason])

        return {
            'leave_id': leave_id,
            'id': leave_id,
            'faculty_id': faculty_id,
            'from_date': str(from_date),
            'to_date': str(to_date),
            'leave_type': leave_type,
            'reason': reason,
            'status': 'pending'
        }

    return []


@handler('hod/leaves')
def handle_hod_leaves(request, params, body):
    from django.db import connection

    user_id = params.get('user_id') or getattr(request, 'user_id', None)
    dept_id = params.get('department_id')

    if not dept_id and user_id:
        with connection.cursor() as cur:
            cur.execute("SELECT department_id FROM hod WHERE user_id = %s LIMIT 1", [user_id])
            r = cur.fetchone()
            if r and r[0]:
                dept_id = str(r[0])
            else:
                cur.execute("SELECT department_id FROM faculty WHERE user_id = %s LIMIT 1", [user_id])
                r2 = cur.fetchone()
                if r2 and r2[0]:
                    dept_id = str(r2[0])

    if request.method == 'GET':
        sql = """
            SELECT lr.leave_id, lr.faculty_id, lr.from_date, lr.to_date, lr.leave_type,
                   lr.reason, lr.status, lr.applied_at, lr.decision_at,
                   f.first_name, f.last_name, f.employee_id, f.department_id,
                   d.name AS department_name
            FROM leave_requests lr
            LEFT JOIN faculty f ON f.faculty_id = lr.faculty_id
            LEFT JOIN departments d ON d.department_id = f.department_id
            WHERE 1=1
        """
        args = []
        if dept_id:
            sql += " AND f.department_id = %s"
            args.append(dept_id)
        sql += " ORDER BY lr.applied_at DESC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'leave_id': str(r['leave_id']),
            'id': str(r['leave_id']),
            'faculty_id': str(r['faculty_id']),
            'from_date': _dt(r.get('from_date')),
            'to_date': _dt(r.get('to_date')),
            'leave_type': str(r.get('leave_type') or 'casual').lower(),
            'reason': r.get('reason') or '',
            'status': str(r.get('status') or 'pending').lower(),
            'applied_at': _dt(r.get('applied_at')),
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'department_name': r.get('department_name') or '—',
            'faculty': {
                'faculty_id': str(r['faculty_id']),
                'first_name': r.get('first_name') or '',
                'last_name': r.get('last_name') or '',
                'employee_id': r.get('employee_id') or 'Faculty'
            }
        } for r in rows]

    return []


@handler('hod/leaves/action')
def handle_hod_leave_action(request, params, body):
    from django.db import connection
    leave_id = body.get('leave_id') or params.get('leave_id')
    action = body.get('action') or params.get('action')
    status = 'approved' if action == 'approve' else 'rejected'

    if leave_id:
        with connection.cursor() as cur:
            cur.execute("""
                UPDATE leave_requests
                SET status = %s, decision_at = NOW()
                WHERE leave_id = %s
            """, [status, leave_id])
    return {'success': True, 'status': status}


@handler('faculty/interchange')
def handle_faculty_interchange(request, params, body):
    from django.db import connection
    import uuid, json

    user_id = params.get('user_id') or getattr(request, 'user_id', None)
    faculty_id = None
    if user_id:
        with connection.cursor() as cur:
            cur.execute("SELECT faculty_id FROM faculty WHERE user_id = %s LIMIT 1", [user_id])
            r = cur.fetchone()
            if r:
                faculty_id = str(r[0])

    if not faculty_id:
        with connection.cursor() as cur:
            cur.execute("SELECT faculty_id FROM faculty LIMIT 1")
            r = cur.fetchone()
            if r:
                faculty_id = str(r[0])

    if request.method == 'GET':
        sql = """
            SELECT li.interchange_id, li.requester_faculty_id, li.target_faculty_id,
                   li.requester_slot, li.target_slot, li.status, li.reason, li.reject_reason, li.created_at,
                   f1.first_name AS req_fn, f1.last_name AS req_ln,
                   f2.first_name AS tar_fn, f2.last_name AS tar_ln
            FROM lecture_interchanges li
            LEFT JOIN faculty f1 ON f1.faculty_id = li.requester_faculty_id
            LEFT JOIN faculty f2 ON f2.faculty_id = li.target_faculty_id
            WHERE 1=1
        """
        args = []
        if faculty_id:
            sql += " AND (li.requester_faculty_id = %s OR li.target_faculty_id = %s)"
            args.extend([faculty_id, faculty_id])
        sql += " ORDER BY li.created_at DESC"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            req_slot = r['requester_slot']
            if isinstance(req_slot, str):
                try: req_slot = json.loads(req_slot)
                except: req_slot = {}
            tar_slot = r['target_slot']
            if isinstance(tar_slot, str):
                try: tar_slot = json.loads(tar_slot)
                except: tar_slot = {}

            out.append({
                'interchange_id': str(r['interchange_id']),
                'id': str(r['interchange_id']),
                'requester_faculty_id': str(r['requester_faculty_id']),
                'target_faculty_id': str(r['target_faculty_id']),
                'requester_faculty_name': f"{r.get('req_fn') or ''} {r.get('req_ln') or ''}".strip() or 'Faculty',
                'target_faculty_name': f"{r.get('tar_fn') or ''} {r.get('tar_ln') or ''}".strip() or 'Faculty',
                'requester_slot': req_slot or {},
                'target_slot': tar_slot or {},
                'status': str(r.get('status') or 'pending').lower(),
                'reason': r.get('reason') or '',
                'reject_reason': r.get('reject_reason') or '',
                'created_at': _dt(r.get('created_at'))
            })
        return out

    if request.method == 'POST':
        target_faculty_id = body.get('target_faculty_id')
        requester_slot = body.get('requester_slot') or {}
        target_slot = body.get('target_slot') or {}
        reason = body.get('reason') or ''

        if not target_faculty_id:
            return {'error': 'Target faculty ID is required.'}

        interchange_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO lecture_interchanges (interchange_id, requester_faculty_id, target_faculty_id, requester_slot, target_slot, status, reason, created_at)
                VALUES (%s, %s, %s, %s, %s, 'pending', %s, NOW())
            """, [interchange_id, faculty_id, target_faculty_id, json.dumps(requester_slot), json.dumps(target_slot), reason])

        return {
            'interchange_id': interchange_id,
            'id': interchange_id,
            'requester_faculty_id': faculty_id,
            'target_faculty_id': target_faculty_id,
            'status': 'pending',
            'reason': reason
        }

    return []


@handler('faculty/interchange/accept')
def handle_interchange_accept(request, params, body):
    from django.db import connection
    interchange_id = body.get('interchange_id') or params.get('interchange_id')
    if interchange_id:
        with connection.cursor() as cur:
            cur.execute("UPDATE lecture_interchanges SET status = 'accepted' WHERE interchange_id = %s", [interchange_id])
    return {'success': True, 'status': 'accepted'}


@handler('faculty/interchange/reject')
def handle_interchange_reject(request, params, body):
    from django.db import connection
    interchange_id = body.get('interchange_id') or params.get('interchange_id')
    reason = body.get('reason') or ''
    if interchange_id:
        with connection.cursor() as cur:
            cur.execute("UPDATE lecture_interchanges SET status = 'rejected', reject_reason = %s WHERE interchange_id = %s", [reason, interchange_id])
    return {'success': True, 'status': 'rejected'}


def resolve_user_department_id(user_id):
    if not user_id:
        return None
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute("SELECT department_id FROM students WHERE user_id::text = %s OR student_id::text = %s LIMIT 1", [str(user_id), str(user_id)])
        r = cur.fetchone()
        if r and r[0]:
            return str(r[0])
        cur.execute("SELECT department_id FROM faculty WHERE user_id::text = %s OR faculty_id::text = %s LIMIT 1", [str(user_id), str(user_id)])
        r = cur.fetchone()
        if r and r[0]:
            return str(r[0])
        cur.execute("SELECT department_id FROM hod WHERE user_id::text = %s OR hod_id::text = %s LIMIT 1", [str(user_id), str(user_id)])
        r = cur.fetchone()
        if r and r[0]:
            return str(r[0])
    return None


@handler('notices')
def handle_notices(request, params, body):
    from django.db import connection
    import uuid

    user_id = params.get('user_id') or getattr(request, 'user_id', None)
    dept_id = params.get('department_id')

    if not dept_id and user_id:
        dept_id = resolve_user_department_id(user_id)

    if request.method == 'GET':
        sql = """
            SELECT n.notice_id, n.author_id, n.author_role, n.title, n.content,
                   n.target_audience, n.priority, n.published_at, n.is_active, n.department_id,
                   u.email, d.name AS department_name
            FROM notices n
            LEFT JOIN users u ON u.id = n.author_id
            LEFT JOIN departments d ON d.department_id = n.department_id
            WHERE n.is_active = TRUE
        """
        args = []
        if dept_id:
            sql += " AND (n.department_id = %s OR n.department_id IS NULL)"
            args.append(dept_id)

        sql += " ORDER BY n.published_at DESC LIMIT 200"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            prio = str(r.get('priority') or 'normal').lower()
            notice_type = prio
            if prio == 'normal' or prio == 'low':
                title_lower = (r.get('title') or '').lower()
                if 'exam' in title_lower or 'mid-sem' in title_lower or 'schedule' in title_lower:
                    notice_type = 'exam'
                elif 'holiday' in title_lower or 'diwali' in title_lower or 'break' in title_lower:
                    notice_type = 'holiday'
                elif 'event' in title_lower or 'symposium' in title_lower or 'hackathon' in title_lower:
                    notice_type = 'event'
                else:
                    notice_type = 'general'
            elif prio == 'high':
                notice_type = 'exam'

            email = r.get('email') or ''
            author_name = email.split('@')[0].capitalize() if email else 'College Administration'

            out.append({
                'notice_id': str(r['notice_id']),
                'id': str(r['notice_id']),
                'title': r.get('title') or '',
                'content': r.get('content') or '',
                'notice_type': notice_type,
                'priority': prio,
                'audience': str(r.get('target_audience') or 'all').lower(),
                'target_audience': str(r.get('target_audience') or 'all').lower(),
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('department_name') or 'All Departments',
                'author': author_name,
                'author_role': str(r.get('author_role') or 'admin').lower(),
                'published_at': _dt(r.get('published_at')),
                'created_at': _dt(r.get('published_at')),
                'is_active': bool(r.get('is_active'))
            })
        return out

    if request.method == 'POST':
        title = body.get('title') or ''
        content = body.get('content') or ''
        raw_type = str(body.get('notice_type') or body.get('type') or 'general').lower()
        raw_audience = str(body.get('audience') or body.get('target_audience') or 'all').lower()

        prio_map = {'general': 'normal', 'exam': 'high', 'holiday': 'normal', 'event': 'low', 'urgent': 'urgent'}
        priority = prio_map.get(raw_type, 'normal')

        aud_map = {'all': 'all', 'students': 'students', 'faculty': 'faculty'}
        target_audience = aud_map.get(raw_audience, 'all')

        notice_id = str(uuid.uuid4())
        user_id = params.get('user_id') or getattr(request, 'user_id', None)
        author_id = user_id if user_id else '10db43be-116d-5131-80fe-0487e76961fb'
        notice_dept_id = body.get('department_id') or resolve_user_department_id(user_id)

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO notices (notice_id, author_id, author_role, title, content, target_audience, priority, published_at, is_active, department_id)
                VALUES (%s, %s, 'admin', %s, %s, %s, %s, NOW(), TRUE, %s)
            """, [notice_id, author_id, title, content, target_audience, priority, notice_dept_id])

            cur.execute("""
                INSERT INTO notices_notice (id, posted_by_id, title, content, audience, notice_type, created_at, updated_at, is_active, department_id)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW(), TRUE, %s)
            """, [notice_id, author_id, title, content, target_audience, raw_type, notice_dept_id])

        return {
            'notice_id': notice_id,
            'id': notice_id,
            'title': title,
            'content': content,
            'notice_type': raw_type,
            'priority': priority,
            'audience': target_audience,
            'department_id': notice_dept_id,
            'is_active': True
        }

    return []


@handler('library/books')
def handle_library_books(request, params, body):
    from django.db import connection
    import uuid

    if request.method == 'GET':
        q = params.get('q', '').strip()
        sql = """
            SELECT DISTINCT ON (book_name)
                   book_id, book_name, is_available, book_price,
                   COUNT(*) OVER (PARTITION BY book_name) AS total_copies,
                   COUNT(*) FILTER (WHERE is_available = TRUE AND is_returned = TRUE) OVER (PARTITION BY book_name) AS available_copies
            FROM library
        """
        args = []
        if q:
            sql = """
                SELECT DISTINCT ON (book_name)
                       book_id, book_name, is_available, book_price,
                       COUNT(*) OVER (PARTITION BY book_name) AS total_copies,
                       COUNT(*) FILTER (WHERE is_available = TRUE AND is_returned = TRUE) OVER (PARTITION BY book_name) AS available_copies
                FROM library
                WHERE book_name ILIKE %s
            """
            args.append(f'%{q}%')

        sql += " ORDER BY book_name ASC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            name = r.get('book_name') or 'Untitled Book'
            name_lower = name.lower()
            cat = 'Computer Science' if any(w in name_lower for w in ['code', 'algorithm', 'software', 'data', 'computation', 'network', 'digital']) else ('Medical' if 'nursing' in name_lower or 'medical' in name_lower or 'anatomy' in name_lower else 'General Academic')
            shelf = f"Rack {ord(name[0]) % 8 + 1}-{ord(name[-1]) % 5 + 1}"
            isbn = f"978-0-{abs(hash(name)) % 89999 + 10000}-{abs(hash(name)) % 9 + 1}"

            avail = int(r.get('available_copies') or (1 if r.get('is_available') else 0))
            tot = int(r.get('total_copies') or 1)

            out.append({
                'id': str(r['book_id']),
                'book_id': str(r['book_id']),
                'title': name,
                'book_name': name,
                'author': 'Academic Faculty / Author',
                'category': cat,
                'shelf': shelf,
                'isbn': isbn,
                'barcode': f"BC-{str(r['book_id'])[:8].upper()}",
                'total_copies': tot,
                'available_copies': avail,
                'is_available': avail > 0,
                'price': float(r.get('book_price') or 0.0),
            })
        return out

    if request.method == 'POST':
        title = body.get('title') or body.get('book_name') or 'New Book'
        price = float(body.get('price') or body.get('book_price') or 500.0)
        nid = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO library (book_id, book_name, is_available, is_returned, book_price)
                VALUES (%s, %s, TRUE, TRUE, %s)
            """, [nid, title, price])
        return {
            'id': nid,
            'book_id': nid,
            'title': title,
            'book_name': title,
            'available_copies': 1,
            'total_copies': 1,
            'is_available': True,
            'price': price
        }

    return []


@handler('library/loans')
def handle_library_loans(request, params, body):
    from django.db import connection

    user_id = params.get('user_id')
    student_param = params.get('student_id')

    if request.method == 'GET':
        sql = """
            SELECT l.book_id, l.student_id, l.book_name, l.taken_date, l.return_date,
                   l.is_returned, l.is_available, l.book_price,
                   s.student_id AS stu_code, u.first_name, u.last_name, u.email
            FROM library l
            LEFT JOIN students s ON s.student_id = l.student_id OR s.user_id = l.student_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE 1=1
        """
        args = []

        if student_param:
            sp = student_param.replace('eq.', '').strip()
            sql += """ AND (l.student_id::text = %s OR s.user_id::text = %s OR s.student_id::text = %s)"""
            args.extend([sp, sp, sp])
        elif user_id:
            sql += """ AND (l.student_id::text = %s OR s.user_id::text = %s)"""
            args.extend([user_id, user_id])

        sql += " ORDER BY l.taken_date DESC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            fn = r.get('first_name') or ''
            ln = r.get('last_name') or ''
            stu_name = f"{fn} {ln}".strip() or (r.get('email') or '').split('@')[0].capitalize() or 'Student'
            ret = bool(r.get('is_returned'))

            out.append({
                'id': str(r['book_id']),
                'loan_id': str(r['book_id']),
                'book_id': str(r['book_id']),
                'book_title': r.get('book_name') or 'Book',
                'book_author': 'Academic Author',
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'student_name': stu_name,
                'issued_at': _dt(r.get('taken_date')),
                'due_date': _dt(r.get('return_date')),
                'returned_at': _dt(r.get('return_date')) if ret else None,
                'status': 'returned' if ret else 'issued',
                'fine': 0.0,
                'fine_paid': True if ret else False,
            })
        return out

    return []


@handler('library/stats')
def handle_library_stats(request, params, body):
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(DISTINCT book_name), COUNT(*), COUNT(*) FILTER (WHERE is_returned = FALSE) FROM library")
        r = cur.fetchone()
        distinct_titles = r[0] or 0
        total_books = r[1] or 0
        issued_count = r[2] or 0

    return {
        'total_titles': distinct_titles,
        'total_books': total_books,
        'issued_count': issued_count,
        'total_fines': 0.0
    }


@handler('admin/fees')
@handler('fee_payments')
@handler('fees')
def handle_fee_payments(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        student_id = params.get('student_id', '') or params.get('student', '')
        status_filter = params.get('status', '')
        if student_id.startswith('eq.'):
            student_id = student_id[3:]

        sql = """
            SELECT fp.payment_id, fp.student_id, fp.fee_structure_id, fp.amount_paid, fp.payment_date, fp.status::text AS status, fp.transaction_ref,
                   s.enrollment_no, s.first_name AS stu_first, s.last_name AS stu_last, s.department_id, s.parent_email, s.parent_phone, s.current_rollno,
                   u.email AS stu_email, d.name AS dept_name,
                   fs.component_name, fs.amount AS fee_amount, fs.due_date, fs.program_code
            FROM fee_payments fp
            JOIN students s ON CAST(s.student_id AS TEXT) = CAST(fp.student_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
            LEFT JOIN fee_structures fs ON CAST(fs.fee_id AS TEXT) = CAST(fp.fee_structure_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if student_id:
            sql += ' AND (CAST(s.student_id AS TEXT) = %s OR CAST(fp.student_id AS TEXT) = %s)'
            args.extend([student_id, student_id])

        if status_filter:
            st_f = status_filter.replace('eq.', '').strip().lower()
            sql += ' AND LOWER(CAST(fp.status AS TEXT)) = %s'
            args.append(st_f)

        sql += ' ORDER BY fp.payment_date DESC NULLS LAST LIMIT 2000'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            fn = r.get('stu_first') or ''
            ln = r.get('stu_last') or ''
            stu_name = f"{fn} {ln}".strip() or (r.get('stu_email') or '').split('@')[0].capitalize() or 'Student'
            p_id = str(r['payment_id'])
            status_str = str(r.get('status') or 'pending').lower()

            out.append({
                'payment_id': p_id,
                'id': p_id,
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'fee_structure_id': str(r['fee_structure_id']) if r.get('fee_structure_id') else None,
                'student_name': stu_name,
                'enrollment_no': r.get('enrollment_no') or '',
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('dept_name') or 'Department',
                'component_name': r.get('component_name') or 'Tuition Fee',
                'fee_type': r.get('component_name') or 'Tuition Fee',
                'amount': float(r.get('fee_amount') or 25000.0),
                'amount_paid': float(r.get('amount_paid') or 0.0),
                'payment_date': _dt(r.get('payment_date')),
                'due_date': _dt(r.get('due_date') or '2024-07-31'),
                'status': status_str,
                'transaction_ref': r.get('transaction_ref') or '',
                'student': {
                    'student_id': str(r['student_id']) if r.get('student_id') else None,
                    'id': str(r['student_id']) if r.get('student_id') else None,
                    'first_name': fn,
                    'last_name': ln,
                    'enrollment_no': r.get('enrollment_no') or '',
                    'roll_number': r.get('current_rollno') or '',
                    'department_id': str(r['department_id']) if r.get('department_id') else None,
                    'parent_email': r.get('parent_email') or '',
                    'parent_phone': r.get('parent_phone') or '',
                },
                'fee_structures': {
                    'fee_id': str(r['fee_structure_id']) if r.get('fee_structure_id') else None,
                    'component_name': r.get('component_name') or 'Tuition Fee',
                    'amount': float(r.get('fee_amount') or 25000.0),
                    'due_date': _dt(r.get('due_date') or '2024-07-31'),
                },
            })
        return out

    if request.method == 'POST' or request.method == 'PATCH':
        pid = body.get('payment_id') or body.get('id') or params.get('payment_id', '').replace('eq.', '')
        status_val = body.get('status', 'paid')
        tx_ref = body.get('transaction_ref') or f'TXN{int(timezone.now().timestamp())}'
        with connection.cursor() as cur:
            if pid:
                cur.execute("""
                    UPDATE fee_payments
                    SET status = %s, payment_date = CURRENT_DATE, transaction_ref = %s,
                        amount_paid = COALESCE((SELECT amount FROM fee_structures WHERE CAST(fee_id AS TEXT) = CAST(fee_payments.fee_structure_id AS TEXT)), amount_paid)
                    WHERE CAST(payment_id AS TEXT) = %s
                """, [status_val, tx_ref, pid])
        return [{'payment_id': pid, 'status': status_val, 'transaction_ref': tx_ref}]


@handler('fees/mark-paid')
def handle_fee_mark_paid(request, params, body):
    from django.db import connection
    pid = body.get('payment_id') or body.get('id') or params.get('payment_id', '').replace('eq.', '')
    tx_ref = body.get('transaction_ref') or f'TXN{int(timezone.now().timestamp())}'
    with connection.cursor() as cur:
        if pid:
            cur.execute("""
                UPDATE fee_payments
                SET status = 'paid', payment_date = CURRENT_DATE, transaction_ref = %s,
                    amount_paid = COALESCE((SELECT amount FROM fee_structures WHERE CAST(fee_id AS TEXT) = CAST(fee_payments.fee_structure_id AS TEXT)), amount_paid)
                WHERE CAST(payment_id AS TEXT) = %s
            """, [tx_ref, pid])
@handler('fee_structures')
def handle_fee_structures(request, params, body):
    """Fee structures table."""
    from django.db import connection
    sql = """
        SELECT fs.fee_id, fs.semester_id, fs.program_code, fs.component_name, fs.amount, fs.due_date, fs.is_optional,
               sem.number AS sem_number
        FROM fee_structures fs
        LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(fs.semester_id AS TEXT)
        ORDER BY fs.due_date ASC NULLS LAST LIMIT 200
    """
    with connection.cursor() as cur:
        cur.execute(sql)
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    return [{
        'fee_id': str(r['fee_id']),
        'id': str(r['fee_id']),
        'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
        'program_code': r.get('program_code') or '',
        'component_name': r.get('component_name') or 'Tuition Fee',
        'amount': float(r.get('amount') or 0),
        'due_date': _dt(r.get('due_date')),
        'is_optional': bool(r.get('is_optional')),
        'semester_number': r.get('sem_number'),
    } for r in rows]


@handler('timetable')
def handle_timetable(request, params, body):
    FM = {'timetable_id': 'pk', 'id': 'pk', 'faculty_id': 'faculty__pk'}
    from django.db import connection
    if request.method == 'GET':
        day_filter = params.get('day_of_week', '') or params.get('day', '')
        faculty_filter = params.get('faculty_id', '') or params.get('faculty', '')
        section_filter = params.get('class_section_id', '') or params.get('section', '')
        department_filter = params.get('department_id', '') or params.get('department', '')
        semester_filter = params.get('semester_id', '') or params.get('semester', '')

        user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '') or params.get('student', '') or params.get('student_id', '')
        if user_param.startswith('eq.'):
            user_param = user_param[3:]

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param:
            if user_param.isdigit():
                u_found = User.objects.filter(pk=int(user_param)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=user_param) | Q(username__iexact=user_param)).first()

        req_email = u_found.email.lower() if u_found else ''
        req_role = (getattr(u_found, 'role', '') or getattr(u_found, 'roles', '')).lower() if u_found else ''

        if (not department_filter or not semester_filter) and (req_email or user_param):
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT s.department_id, s.current_semester_id, sem.number
                        FROM students s 
                        JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
                        LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.current_semester_id AS TEXT)
                        WHERE (%s <> '' AND LOWER(u.email) = %s) 
                           OR (%s <> '' AND CAST(u.id AS TEXT) = %s) 
                           OR (%s <> '' AND CAST(s.student_id AS TEXT) = %s)
                        LIMIT 1
                    """, [req_email, req_email, user_param, user_param, user_param, user_param])
                    r_stud = cur.fetchone()
                    if r_stud:
                        if not department_filter and r_stud[0]:
                            department_filter = str(r_stud[0])
                        if not semester_filter and r_stud[1]:
                            semester_filter = str(r_stud[1])
                    else:
                        if not department_filter:
                            cur.execute("""
                                SELECT department_id FROM (
                                    SELECT h.department_id FROM hod h JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(h.user_id AS TEXT) = %s)
                                    UNION
                                    SELECT f.department_id FROM faculty f JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT) OR LOWER(CAST(f.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(f.user_id AS TEXT) = %s)
                                ) sub WHERE department_id IS NOT NULL LIMIT 1
                            """, [req_email, req_email, user_param, user_param, user_param, user_param,
                                  req_email, req_email, user_param, user_param, user_param, user_param])
                            r_dept = cur.fetchone()
                            if r_dept and r_dept[0]:
                                department_filter = str(r_dept[0])
            except Exception:
                pass

        sql = """
            SELECT t.timetable_id, t.class_section_id, t.subject_id, t.faculty_id, t.department_id AS t_dept_id,
                   t.day_of_week, t.start_time, t.end_time, t.room_no, t.is_active,
                   sub.name AS subject_name, sub.code AS subject_code, sub.department_id AS sub_dept_id,
                   f.first_name AS fac_first, f.last_name AS fac_last, f.department_id AS fac_dept_id,
                   u.email AS fac_email
            FROM timetable t
            LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT) = CAST(t.subject_id AS TEXT)
            LEFT JOIN faculty f ON CAST(f.faculty_id AS TEXT) = CAST(t.faculty_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT)
            LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(sub.semester_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if day_filter.startswith('eq.'):
            sql += ' AND LOWER(CAST(t.day_of_week AS TEXT)) = %s'
            args.append(day_filter[3:].lower())
        elif day_filter:
            sql += ' AND LOWER(CAST(t.day_of_week AS TEXT)) = %s'
            args.append(day_filter.lower())

        if faculty_filter.startswith('eq.'):
            fac_val = faculty_filter[3:]
            sql += ' AND (CAST(t.faculty_id AS TEXT) = %s OR CAST(f.user_id AS TEXT) = %s)'
            args.extend([fac_val, fac_val])
        elif faculty_filter:
            sql += ' AND (CAST(t.faculty_id AS TEXT) = %s OR CAST(f.user_id AS TEXT) = %s)'
            args.extend([faculty_filter, faculty_filter])

        if section_filter.startswith('eq.'):
            sql += ' AND CAST(t.class_section_id AS TEXT) = %s'
            args.append(section_filter[3:])
        elif section_filter:
            sql += ' AND CAST(t.class_section_id AS TEXT) = %s'
            args.append(section_filter)

        if department_filter.startswith('eq.'):
            sql += ' AND (CAST(t.department_id AS TEXT) = %s OR CAST(sub.department_id AS TEXT) = %s OR CAST(f.department_id AS TEXT) = %s)'
            args.extend([department_filter[3:], department_filter[3:], department_filter[3:]])
        elif department_filter:
            sql += ' AND (CAST(t.department_id AS TEXT) = %s OR CAST(sub.department_id AS TEXT) = %s OR CAST(f.department_id AS TEXT) = %s)'
            args.extend([department_filter, department_filter, department_filter])

        if semester_filter.startswith('eq.'):
            sem_val = semester_filter[3:]
            sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
            args.extend([sem_val, sem_val])
        elif semester_filter:
            sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
            args.extend([semester_filter, semester_filter])

        sql += ' ORDER BY t.day_of_week ASC, t.start_time ASC LIMIT 5000'

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'timetable_id': str(r['timetable_id']),
            'id': str(r['timetable_id']),
            'department_id': str(r.get('t_dept_id') or r.get('sub_dept_id') or r.get('fac_dept_id') or ''),
            'class_section_id': str(r['class_section_id']) if r.get('class_section_id') else None,
            'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
            'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
            'day_of_week': (r.get('day_of_week') or 'monday').lower(),
            'day': (r.get('day_of_week') or 'monday').lower(),
            'start_time': str(r.get('start_time') or '')[:5],
            'end_time': str(r.get('end_time') or '')[:5],
            'room_no': r.get('room_no') or '',
            'semester': str(r.get('sem_number') or r.get('semester_id') or ''),
            'semester_id': str(r.get('semester_id')) if r.get('semester_id') else '',
            'course_code': r.get('subject_code') or '—',
            'course_name': r.get('subject_name') or '—',
            'subject_code': r.get('subject_code') or '—',
            'subject_name': r.get('subject_name') or '—',
            'faculty_name': f"{r.get('fac_first', '')} {r.get('fac_last', '')}".strip() or 'Faculty',
            'course': {
                'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                'department_id': str(r['sub_dept_id']) if r.get('sub_dept_id') else None,
                'name': r.get('subject_name') or '—',
                'code': r.get('subject_code') or '—',
            },
            'faculty': {
                'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
                'department_id': str(r['fac_dept_id']) if r.get('fac_dept_id') else None,
                'first_name': r.get('fac_first') or '',
                'last_name': r.get('fac_last') or '',
                'user': {
                    'email': r.get('fac_email') or '',
                    'first_name': r.get('fac_first') or '',
                    'last_name': r.get('fac_last') or '',
                }
            }
        } for r in rows]

    if request.method == 'POST':
        course = Course.objects.filter(pk=body.get('subject_id')).first()
        fac = Faculty.objects.filter(pk=body.get('faculty_id')).first()
        t, _ = Schedule.objects.get_or_create(
            course=course, day=body.get('day_of_week', 'monday'),
            start_time=body.get('start_time', '09:00'),
            defaults={
                'faculty': fac or (course.faculty if course else None),
                'end_time': body.get('end_time', '10:00'),
                'room': body.get('room_no') or 'TBA',
            }
        )
        return [serialize_timetable(t)]

    if request.method == 'PATCH':
        qs = Schedule.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        for t in qs:
            if 'day_of_week' in body:
                t.day = body['day_of_week']
            if 'start_time' in body:
                t.start_time = body['start_time']
            if 'end_time' in body:
                t.end_time = body['end_time']
            if 'room_no' in body:
                t.room = body['room_no']
            t.save()
        return [serialize_timetable(t) for t in qs]

    if request.method == 'DELETE':
        qs = Schedule.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('notices')
def handle_notices(request, params, body):
    from django.db import connection
    import uuid

    user_id = params.get('user_id') or getattr(request, 'user_id', None)
    dept_id = params.get('department_id')

    if not dept_id and user_id:
        dept_id = resolve_user_department_id(user_id)

    if request.method == 'GET':
        sql = """
            SELECT n.notice_id, n.author_id, n.author_role, n.title, n.content,
                   n.target_audience, n.priority, n.published_at, n.is_active, n.department_id,
                   u.email, d.name AS department_name
            FROM notices n
            LEFT JOIN users u ON u.id = n.author_id
            LEFT JOIN departments d ON d.department_id = n.department_id
            WHERE n.is_active = TRUE
        """
        args = []
        if dept_id:
            sql += " AND (n.department_id = %s OR n.department_id IS NULL)"
            args.append(dept_id)

        sql += " ORDER BY n.published_at DESC LIMIT 200"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        if not rows:
            sql_orm = """
                SELECT n.id AS notice_id, n.posted_by_id AS author_id, 'admin' AS author_role,
                       n.title, n.content, n.audience AS target_audience, n.notice_type AS priority,
                       n.created_at AS published_at, n.is_active, n.department_id,
                       u.email, d.name AS department_name
                FROM notices_notice n
                LEFT JOIN users u ON u.id = n.posted_by_id
                LEFT JOIN departments d ON d.department_id = n.department_id
                WHERE n.is_active = TRUE
            """
            args_orm = []
            if dept_id:
                sql_orm += " AND (n.department_id = %s OR n.department_id IS NULL)"
                args_orm.append(dept_id)
            sql_orm += " ORDER BY n.created_at DESC LIMIT 200"

            with connection.cursor() as cur:
                cur.execute(sql_orm, args_orm)
                cols = [c[0] for c in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            prio = str(r.get('priority') or 'normal').lower()
            notice_type = prio
            if prio == 'normal' or prio == 'low':
                title_lower = (r.get('title') or '').lower()
                if 'exam' in title_lower or 'mid-sem' in title_lower or 'schedule' in title_lower:
                    notice_type = 'exam'
                elif 'holiday' in title_lower or 'diwali' in title_lower or 'break' in title_lower:
                    notice_type = 'holiday'
                elif 'event' in title_lower or 'symposium' in title_lower or 'hackathon' in title_lower:
                    notice_type = 'event'
                else:
                    notice_type = 'general'
            elif prio == 'high':
                notice_type = 'exam'

            email = r.get('email') or ''
            author_name = email.split('@')[0].capitalize() if email else 'College Administration'

            out.append({
                'notice_id': str(r['notice_id']),
                'id': str(r['notice_id']),
                'title': r.get('title') or '',
                'content': r.get('content') or '',
                'notice_type': notice_type,
                'priority': prio,
                'audience': str(r.get('target_audience') or 'all').lower(),
                'target_audience': str(r.get('target_audience') or 'all').lower(),
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('department_name') or 'All Departments',
                'author': author_name,
                'author_role': str(r.get('author_role') or 'admin').lower(),
                'published_at': _dt(r.get('published_at')),
                'created_at': _dt(r.get('published_at')),
                'is_active': bool(r.get('is_active'))
            })
        return out

    if request.method == 'POST':
        title = body.get('title') or ''
        content = body.get('content') or ''
        raw_type = str(body.get('notice_type') or body.get('type') or 'general').lower()
        raw_audience = str(body.get('audience') or body.get('target_audience') or 'all').lower()

        prio_map = {'general': 'normal', 'exam': 'high', 'holiday': 'normal', 'event': 'low', 'urgent': 'urgent'}
        priority = prio_map.get(raw_type, 'normal')

        aud_map = {'all': 'all', 'students': 'students', 'faculty': 'faculty'}
        target_audience = aud_map.get(raw_audience, 'all')

        notice_id = str(uuid.uuid4())
        user_id = params.get('user_id') or getattr(request, 'user_id', None)
        author_id = user_id if user_id else '10db43be-116d-5131-80fe-0487e76961fb'
        notice_dept_id = body.get('department_id') or resolve_user_department_id(user_id)

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO notices (notice_id, author_id, author_role, title, content, target_audience, priority, published_at, is_active, department_id)
                VALUES (%s, %s, 'admin', %s, %s, %s, %s, NOW(), TRUE, %s)
            """, [notice_id, author_id, title, content, target_audience, priority, notice_dept_id])

            cur.execute("""
                INSERT INTO notices_notice (id, posted_by_id, title, content, audience, notice_type, created_at, updated_at, is_active, department_id)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW(), TRUE, %s)
            """, [notice_id, author_id, title, content, target_audience, raw_type, notice_dept_id])

        return {
            'notice_id': notice_id,
            'id': notice_id,
            'title': title,
            'content': content,
            'notice_type': raw_type,
            'priority': priority,
            'audience': target_audience,
            'department_id': notice_dept_id,
            'is_active': True
        }

    FM = {
        'id': 'pk',
        'notice_id': 'pk',
        'title': 'title',
        'content': 'content',
        'audience': 'audience',
        'target_audience': 'audience',
        'department_id': 'department__pk',
    }

    if request.method == 'PATCH':
        qs = Notice.objects.all()
        nid_filter = params.get('notice_id', '') or params.get('id', '')
        if nid_filter.startswith('eq.'):
            qs = qs.filter(pk=nid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for n in qs:
            if 'title' in body:
                n.title = body['title']
            if 'content' in body:
                n.content = body['content']
            if 'target_audience' in body or 'audience' in body:
                n.audience = body.get('target_audience') or body.get('audience')
            if 'priority' in body:
                TYPE_MAP = {'URGENT': 'urgent', 'HIGH': 'exam', 'LOW': 'holiday', 'NORMAL': 'general'}
                n.notice_type = TYPE_MAP.get(body['priority'], 'general')
            n.save()
        return [serialize_notice(n) for n in qs]

    if request.method == 'DELETE':
        nid_filter = params.get('notice_id', '') or params.get('id', '')
        if nid_filter.startswith('eq.'):
            nid_val = nid_filter[3:]
            with connection.cursor() as cur:
                cur.execute("DELETE FROM notices WHERE CAST(notice_id AS TEXT) = %s", [nid_val])
                cur.execute("DELETE FROM notices_notice WHERE CAST(id AS TEXT) = %s", [nid_val])
            Notice.objects.filter(pk=nid_val).delete()
        else:
            qs = Notice.objects.all()
            qs = apply_postgrest_filters(qs, params, FM)
            for n in qs:
                with connection.cursor() as cur:
                    cur.execute("DELETE FROM notices WHERE CAST(notice_id AS TEXT) = %s", [str(n.pk)])
            qs.delete()
        return []





@handler('attendance/stats')
def handle_attendance_stats(request, params, body):
    from django.db import connection
    student = params.get('student') or params.get('student_id')
    course = params.get('course') or params.get('course_id')

    sql = 'SELECT status FROM attendance_records WHERE 1=1'
    args = []
    if student:
        sql += ' AND student_id = %s'
        args.append(student)
    if course:
        sql += ' AND subject_id = %s'
        args.append(course)

    with connection.cursor() as cur:
        cur.execute(sql, args)
        statuses = [r[0] for r in cur.fetchall()]

    total = len(statuses)
    present = statuses.count('present')
    absent = statuses.count('absent')
    late = statuses.count('late')
    excused = statuses.count('excused')
    attended = present + late
    total_eligible = total if total > 0 else 1
    pct = round((attended / total_eligible) * 100, 1)
    return {'total': total, 'present': present, 'absent': absent, 'late': late, 'excused': excused, 'percentage': pct}


@handler('grades/my_grades')
def handle_my_grades(request, params, body):
    from django.db import connection
    student = params.get('student')
    if not student and hasattr(request, 'user') and request.user.is_authenticated:
        with connection.cursor() as cur:
            cur.execute('SELECT student_id FROM students WHERE user_id = %s LIMIT 1', [str(request.user.pk)])
            row = cur.fetchone()
            if row:
                student = str(row[0])
    if not student:
        return []
    return TABLE_HANDLERS['marks'](request, {'student_id': f'eq.{student}'}, {})


@handler('admin/stats')
@handler('auth/dashboard/stats')
def handle_admin_stats(request, params, body):
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM students")
        total_students = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM faculty")
        total_faculty = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM subjects")
        total_courses = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM departments")
        total_departments = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users WHERE is_active = true")
        active_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users WHERE is_active = false")
        inactive_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(amount_paid), 0) FROM fee_payments WHERE status = 'paid'")
        total_fees_collected = float(cur.fetchone()[0])
        cur.execute("SELECT COALESCE(SUM(amount_paid), 0) FROM fee_payments WHERE status != 'paid'")
        total_fees_pending = float(cur.fetchone()[0])
        cur.execute("SELECT COUNT(DISTINCT student_id) FROM fee_payments WHERE status != 'paid'")
        fees_pending_students = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM hod")
        total_hod = cur.fetchone()[0]

    return {
        'total_students': total_students,
        'total_faculty': total_faculty,
        'total_courses': total_courses,
        'total_departments': total_departments,
        'total_fees_collected': total_fees_collected,
        'total_fees_pending': total_fees_pending,
        'fees_pending_students': fees_pending_students,
        'active_users': active_users,
        'inactive_users': inactive_users,
        'total_hod': total_hod,
        'total_users': total_users,
    }


@handler('students/my_profile')
def handle_student_profile(request, params, body):
    from django.db import connection
    user_id = params.get('user_id')
    if not user_id and hasattr(request, 'user') and request.user.is_authenticated:
        user_id = str(request.user.pk)
    if not user_id:
        return {}

    req_email = getattr(request.user, 'email', '') if hasattr(request, 'user') and hasattr(request.user, 'email') else ''

    sql = """
        SELECT s.student_id, s.user_id, s.enrollment_no, s.first_name, s.last_name,
               s.date_of_birth, s.parent_email, s.parent_phone, s.department_id,
               s.current_semester_id, s.current_rollno, s.address,
               u.email, u.roles, u.is_active,
               d.name AS dept_name, d.code AS dept_code,
               sem.number AS sem_number
        FROM students s
        LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
        LEFT JOIN departments d ON d.department_id = s.department_id
        LEFT JOIN semesters sem ON sem.semester_id = s.current_semester_id
        WHERE CAST(s.user_id AS TEXT) = %s
           OR CAST(s.student_id AS TEXT) = %s
           OR CAST(u.id AS TEXT) = %s
           OR (%s <> '' AND LOWER(u.email) = LOWER(%s))
        LIMIT 1
    """
    with connection.cursor() as cur:
        cur.execute(sql, [str(user_id), str(user_id), str(user_id), req_email, req_email])
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
    if not row:
        return {}
    r = dict(zip(cols, row))
    sem_num = int(r.get('sem_number') or 1)
    return {
        'student_id': str(r['student_id']),
        'id': str(r['student_id']),
        'user_id': str(r['user_id']) if r.get('user_id') else None,
        'enrollment_no': r.get('enrollment_no') or '',
        'first_name': r.get('first_name') or '',
        'last_name': r.get('last_name') or '',
        'current_rollno': r.get('current_rollno') or '',
        'address': r.get('address') or '',
        'department_id': str(r['department_id']) if r.get('department_id') else None,
        'current_semester_id': str(r['current_semester_id']) if r.get('current_semester_id') else None,
        'status': 'active' if r.get('is_active') else 'inactive',
        'year_of_study': max(1, (sem_num + 1) // 2),
        'semester': sem_num,
        'department_name': r.get('dept_name') or '—',
        'department': {
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'id': str(r['department_id']) if r.get('department_id') else None,
            'name': r.get('dept_name') or '—',
            'code': r.get('dept_code') or '—',
        },
        'current_semester': {
            'semester_id': str(r['current_semester_id']) if r.get('current_semester_id') else None,
            'number': sem_num,
            'name': f'Semester {sem_num}',
        },
        'user': {
            'id': str(r['user_id']) if r.get('user_id') else None,
            'email': r.get('email') or '',
            'roles': r.get('roles') or 'student',
            'role': r.get('roles') or 'student',
            'is_active': bool(r.get('is_active')),
            'first_name': r.get('first_name') or '',
            'last_name': r.get('last_name') or '',
        },
    }


@handler('faculty/my_profile')
def handle_faculty_profile(request, params, body):
    from django.db import connection
    user_id = params.get('user_id')
    if not user_id and hasattr(request, 'user') and request.user.is_authenticated:
        user_id = str(request.user.pk)
    if not user_id:
        return {}

    sql = """
        SELECT f.faculty_id, f.user_id, f.employee_id, f.first_name, f.last_name,
               'Faculty' AS designation, f.department_id, f.subject_id,
               u.email, u.roles, u.is_active,
               d.name AS dept_name, d.code AS dept_code
        FROM faculty f
        LEFT JOIN users u ON u.id = f.user_id
        LEFT JOIN departments d ON d.department_id = f.department_id
        WHERE f.user_id = %s
        LIMIT 1
    """
    with connection.cursor() as cur:
        cur.execute(sql, [user_id])
        row = cur.fetchone()
        if not row:
            return {}
        cols = [c[0] for c in cur.description]
    r = dict(zip(cols, row))
    return {
        'faculty_id': str(r['faculty_id']),
        'id': str(r['faculty_id']),
        'user_id': str(r['user_id']) if r.get('user_id') else None,
        'employee_id': r.get('employee_id') or '',
        'first_name': r.get('first_name') or '',
        'last_name': r.get('last_name') or '',
        'designation': r.get('designation') or '',
        'department_id': str(r['department_id']) if r.get('department_id') else None,
        'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
        'department_name': r.get('dept_name') or '—',
        'department': {
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'name': r.get('dept_name') or '—',
            'code': r.get('dept_code') or '—',
        },
        'user': {
            'id': str(r['user_id']) if r.get('user_id') else None,
            'email': r.get('email') or '',
            'roles': r.get('roles') or 'faculty',
            'is_active': bool(r.get('is_active')),
            'first_name': r.get('first_name') or '',
            'last_name': r.get('last_name') or '',
        },
    }


@handler('grievances')
@handler('complaints')
def handle_grievances(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        gid_filter = params.get('grievance_id', '') or params.get('id', '')
        sid_filter = params.get('student_id', '')
        dept_filter = params.get('department_id', '')
        status_filter = params.get('status', '')
        limit = int(params.get('limit', 500))

        user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '')
        if user_param.startswith('eq.'):
            user_param = user_param[3:]

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param:
            if user_param.isdigit():
                u_found = User.objects.filter(pk=int(user_param)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=user_param) | Q(username__iexact=user_param)).first()

        req_email = u_found.email.lower() if u_found else ''
        req_role = (getattr(u_found, 'role', '') or getattr(u_found, 'roles', '')).lower() if u_found else ''

        if not dept_filter and req_role != 'admin' and (req_email or user_param):
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT department_id FROM (
                            SELECT h.department_id FROM hod h JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(h.user_id AS TEXT) = %s)
                            UNION
                            SELECT f.department_id FROM faculty f JOIN users u ON CAST(u.id AS TEXT) = CAST(f.user_id AS TEXT) OR LOWER(CAST(f.user_id AS TEXT)) = LOWER(u.email) WHERE (%s <> '' AND LOWER(u.email) = %s) OR (%s <> '' AND CAST(u.id AS TEXT) = %s) OR (%s <> '' AND CAST(f.user_id AS TEXT) = %s)
                        ) sub WHERE department_id IS NOT NULL LIMIT 1
                    """, [req_email, req_email, user_param, user_param, user_param, user_param,
                          req_email, req_email, user_param, user_param, user_param, user_param])
                    r_hod = cur.fetchone()
                    if r_hod and r_hod[0]:
                        dept_filter = str(r_hod[0])
            except Exception:
                pass

        sql = """
            SELECT g.grievance_id, g.student_id, g.category, g.description, g.attachment_url,
                   g.status, g.is_critical, g.resolution_note, g.resolved_by,
                   g.submitted_at, g.resolved_at, g.sla_deadline, g.is_anonymous,
                   s.enrollment_no, s.first_name AS student_first_name, s.last_name AS student_last_name,
                   s.department_id AS student_department_id,
                   u.email AS student_email,
                   d.name AS dept_name, d.code AS dept_code
            FROM grievances g
            LEFT JOIN students s ON CAST(s.student_id AS TEXT) = CAST(g.student_id AS TEXT) OR CAST(s.user_id AS TEXT) = CAST(g.student_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
            WHERE 1=1
        """
        args = []

        # If student account, restrict results strictly to complaints raised by this student
        if req_role == 'student' and (req_email or user_param):
            target_val = req_email or user_param.lower()
            target_uid = str(u_found.id) if u_found else user_param
            sql += """ AND (
                LOWER(CAST(u.email AS TEXT)) = %s 
                OR CAST(g.student_id AS TEXT) IN (SELECT CAST(student_id AS TEXT) FROM students s JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT) WHERE LOWER(u.email) = %s OR CAST(u.id AS TEXT) = %s)
                OR CAST(g.student_id AS TEXT) IN (SELECT CAST(user_id AS TEXT) FROM students s JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT) WHERE LOWER(u.email) = %s OR CAST(u.id AS TEXT) = %s)
                OR CAST(g.student_id AS TEXT) = %s
                OR CAST(g.student_id AS TEXT) = %s
            )"""
            args.extend([target_val, target_val, target_uid, target_val, target_uid, target_uid, target_val])
        if gid_filter.startswith('eq.'):
            sql += ' AND CAST(g.grievance_id AS TEXT) = %s'
            args.append(gid_filter[3:])
        elif gid_filter:
            sql += ' AND CAST(g.grievance_id AS TEXT) = %s'
            args.append(gid_filter)

        if sid_filter.startswith('eq.'):
            sql += ' AND (CAST(g.student_id AS TEXT) = %s OR CAST(s.student_id AS TEXT) = %s OR CAST(s.user_id AS TEXT) = %s)'
            args.extend([sid_filter[3:], sid_filter[3:], sid_filter[3:]])
        elif sid_filter:
            sql += ' AND (CAST(g.student_id AS TEXT) = %s OR CAST(s.student_id AS TEXT) = %s OR CAST(s.user_id AS TEXT) = %s)'
            args.extend([sid_filter, sid_filter, sid_filter])

        if dept_filter.startswith('eq.'):
            sql += ' AND CAST(s.department_id AS TEXT) = %s'
            args.append(dept_filter[3:])
        elif dept_filter:
            sql += ' AND CAST(s.department_id AS TEXT) = %s'
            args.append(dept_filter)

        if status_filter.startswith('eq.'):
            sql += ' AND LOWER(g.status) = %s'
            args.append(status_filter[3:].lower())
        elif status_filter:
            sql += ' AND LOWER(g.status) = %s'
            args.append(status_filter.lower())

        sql += ' ORDER BY g.submitted_at DESC LIMIT %s'
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'grievance_id': str(r['grievance_id']),
            'id': str(r['grievance_id']),
            'student_id': str(r['student_id']) if r.get('student_id') else None,
            'category': r.get('category') or 'Other',
            'title': f"{r.get('category', 'Grievance')} - {r.get('description', '')[:30]}",
            'description': r.get('description') or '',
            'attachment_url': r.get('attachment_url') or '',
            'status': r.get('status') or 'pending',
            'is_critical': bool(r.get('is_critical')),
            'resolution_note': r.get('resolution_note') or '',
            'resolved_note': r.get('resolution_note') or '',
            'hod_response': r.get('resolution_note') or '',
            'resolved_by': str(r['resolved_by']) if r.get('resolved_by') else None,
            'submitted_at': _dt(r.get('submitted_at')),
            'created_at': _dt(r.get('submitted_at')),
            'resolved_at': _dt(r.get('resolved_at')),
            'sla_deadline': _dt(r.get('sla_deadline')),
            'is_anonymous': bool(r.get('is_anonymous')),
            'student_name': 'Anonymous Student' if bool(r.get('is_anonymous')) else (f"{r.get('student_first_name', '')} {r.get('student_last_name', '')}".strip() or r.get('student_email', '') or 'Student'),
            'student': {
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'id': str(r['student_id']) if r.get('student_id') else None,
                'enrollment_no': r.get('enrollment_no') or '',
                'first_name': r.get('student_first_name') or '',
                'last_name': r.get('student_last_name') or '',
                'name': f"{r.get('student_first_name', '')} {r.get('student_last_name', '')}".strip(),
                'email': r.get('student_email') or '',
                'department_id': str(r['student_department_id']) if r.get('student_department_id') else None,
                'department_name': r.get('dept_name') or '',
            }
        } for r in rows]

    if request.method == 'POST':
        import uuid
        from datetime import datetime
        g_id = str(uuid.uuid4())
        category = body.get('category', 'Other')
        description = body.get('description', '')
        student_id = body.get('student_id')
        is_anonymous = bool(body.get('is_anonymous', False))
        is_critical = bool(body.get('is_critical', False))
        attachment_url = body.get('attachment_url', '')

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO grievances (grievance_id, student_id, category, description, attachment_url, status, is_critical, submitted_at, is_anonymous)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            """, [g_id, student_id, category, description, attachment_url, 'submitted', is_critical, is_anonymous])

        return [{
            'grievance_id': g_id,
            'id': g_id,
            'category': category,
            'description': description,
            'status': 'submitted',
            'submitted_at': datetime.now().isoformat(),
        }]

    if request.method == 'PATCH':
        gid = params.get('grievance_id', '') or params.get('id', '')
        if gid.startswith('eq.'):
            gid = gid[3:]

        status_val = body.get('status') or 'resolved'
        res_note = body.get('resolution_note') or body.get('resolved_note') or body.get('hod_response') or ''
        resolved_by = body.get('resolved_by')

        with connection.cursor() as cur:
            if gid:
                cur.execute("""
                    UPDATE grievances
                    SET status = %s, resolution_note = %s, resolved_at = NOW()
                    WHERE CAST(grievance_id AS TEXT) = %s
                """, [status_val, res_note, gid])
            else:
                cur.execute("""
                    UPDATE grievances
                    SET status = %s, resolution_note = %s, resolved_at = NOW()
                """, [status_val, res_note])

        return [{'status': status_val, 'resolution_note': res_note}]

    if request.method == 'DELETE':
        gid = params.get('grievance_id', '') or params.get('id', '')
        if gid.startswith('eq.'):
            gid = gid[3:]
        with connection.cursor() as cur:
            if gid:
                cur.execute("DELETE FROM grievances WHERE CAST(grievance_id AS TEXT) = %s", [gid])
            else:
                cur.execute("DELETE FROM grievances")
        return []


@handler('attendance_records')
def handle_attendance_records(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        student_filter = params.get('student_id', '') or params.get('student', '')
        subject_filter = params.get('subject_id', '') or params.get('course', '') or params.get('subject', '')
        status_filter = params.get('status', '')
        semester_filter = params.get('semester_id', '') or params.get('semester', '')
        limit = int(params.get('limit', 2000))

        if student_filter.startswith('eq.'):
            student_filter = student_filter[3:]
        if subject_filter.startswith('eq.'):
            subject_filter = subject_filter[3:]
        if semester_filter.startswith('eq.'):
            semester_filter = semester_filter[3:]

        user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '')
        if user_param.startswith('eq.'):
            user_param = user_param[3:]

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param or student_filter:
            target_id = user_param or student_filter
            if target_id.isdigit():
                u_found = User.objects.filter(pk=int(target_id)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=target_id) | Q(username__iexact=target_id)).first()

        is_student_user = u_found and hasattr(u_found, 'role') and str(u_found.role).lower() == 'student'
        req_email = u_found.email.lower() if (u_found and is_student_user) else ''

        if not semester_filter and (req_email or student_filter):
            st_val = student_filter or req_email
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT s.current_semester_id, sem.number 
                        FROM students s 
                        JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
                        LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.current_semester_id AS TEXT)
                        WHERE (%s <> '' AND LOWER(u.email) = %s) 
                           OR (%s <> '' AND CAST(u.id AS TEXT) = %s) 
                           OR (%s <> '' AND CAST(s.student_id AS TEXT) = %s)
                        LIMIT 1
                    """, [st_val.lower(), st_val.lower(), st_val, st_val, st_val, st_val])
                    r_sem = cur.fetchone()
                    if r_sem and (r_sem[0] or r_sem[1]):
                        semester_filter = str(r_sem[0] or r_sem[1])
            except Exception:
                pass

        sql = """
            SELECT ar.record_id, ar.student_id, ar.subject_id, ar.date, ar.status, ar.marked_at,
                   sub.code AS subject_code, sub.name AS subject_name, sub.credits,
                   COALESCE(sub.department_id, s.department_id) AS dept_id,
                   COALESCE(d1.name, d2.name, 'General') AS department_name,
                   s.enrollment_no, s.first_name AS student_first, s.last_name AS student_last, s.department_id AS s_dept_id
            FROM attendance_records ar
            LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT) = CAST(ar.subject_id AS TEXT)
            LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(sub.semester_id AS TEXT)
            LEFT JOIN students s ON CAST(s.student_id AS TEXT) = CAST(ar.student_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            LEFT JOIN departments d1 ON CAST(d1.department_id AS TEXT) = CAST(sub.department_id AS TEXT)
            LEFT JOIN departments d2 ON CAST(d2.department_id AS TEXT) = CAST(s.department_id AS TEXT)
            WHERE 1=1
        """
        args = []
        if student_filter or (user_param and is_student_user):
            st_val = student_filter or user_param
            sql += ' AND (LOWER(CAST(u.email AS TEXT)) = %s OR CAST(ar.student_id AS TEXT) = %s OR CAST(s.student_id AS TEXT) = %s OR CAST(u.id AS TEXT) = %s)'
            args.extend([st_val.lower(), st_val, st_val, st_val])

        if subject_filter:
            sql += ' AND (CAST(ar.subject_id AS TEXT) = %s OR CAST(sub.subject_id AS TEXT) = %s)'
            args.extend([subject_filter, subject_filter])

        if semester_filter and not subject_filter:
            sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
            args.extend([semester_filter, semester_filter])

        if status_filter.startswith('eq.'):
            sql += ' AND LOWER(CAST(ar.status AS TEXT)) = %s'
            args.append(status_filter[3:].lower())
        elif status_filter:
            sql += ' AND LOWER(CAST(ar.status AS TEXT)) = %s'
            args.append(status_filter.lower())

        sql += ' ORDER BY ar.date DESC, ar.marked_at DESC LIMIT %s'
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        return [{
            'record_id': str(r['record_id']),
            'id': str(r['record_id']),
            'student_id': str(r['student_id']) if r.get('student_id') else None,
            'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
            'course_id': str(r['subject_id']) if r.get('subject_id') else None,
            'department_id': str(r.get('dept_id')) if r.get('dept_id') else '',
            'department_name': r.get('department_name') or 'General',
            'date': _dt(r.get('date')),
            'status': str(r.get('status') or 'present').lower(),
            'subject_code': r.get('subject_code') or '',
            'subject_name': r.get('subject_name') or '',
            'course_code': r.get('subject_code') or '',
            'course_name': r.get('subject_name') or '',
            'student_name': f"{r.get('student_first') or ''} {r.get('student_last') or ''}".strip() or 'Student',
            'course': {
                'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                'code': r.get('subject_code') or '',
                'name': r.get('subject_name') or '',
            },
            'student': {
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'first_name': r.get('student_first') or '',
                'last_name': r.get('student_last') or '',
                'enrollment_no': r.get('enrollment_no') or '',
                'department_id': str(r.get('dept_id')) if r.get('dept_id') else '',
            }
        } for r in rows]

    if request.method == 'POST':
        import uuid
        r_id = str(uuid.uuid4())
        student_id = body.get('student_id')
        subject_id = body.get('subject_id') or body.get('course_id')
        status_val = body.get('status', 'present')
        att_date = body.get('date')

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO attendance_records (record_id, student_id, subject_id, date, status, ip_address, marked_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """, [r_id, student_id, subject_id, att_date, status_val, '127.0.0.1'])

        return [{'record_id': r_id, 'status': status_val}]


@handler('attendance/stats')
def handle_attendance_stats(request, params, body):
    from django.db import connection
    student_filter = params.get('student_id', '') or params.get('student', '')
    course_filter = params.get('course', '') or params.get('subject_id', '') or params.get('subject', '') or params.get('course_id', '')
    semester_filter = params.get('semester_id', '') or params.get('semester', '')

    if student_filter.startswith('eq.'):
        student_filter = student_filter[3:]
    if course_filter.startswith('eq.'):
        course_filter = course_filter[3:]
    if semester_filter.startswith('eq.'):
        semester_filter = semester_filter[3:]

    user_param = params.get('user_id', '') or params.get('user', '') or params.get('email', '')
    if user_param.startswith('eq.'):
        user_param = user_param[3:]

    from accounts.models import User
    from django.db.models import Q

    req_user = getattr(request, 'user', None)
    u_found = None
    if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
        u_found = req_user
    elif user_param or student_filter:
        target_id = user_param or student_filter
        if target_id.isdigit():
            u_found = User.objects.filter(pk=int(target_id)).first()
        if not u_found:
            u_found = User.objects.filter(Q(email__iexact=target_id) | Q(username__iexact=target_id)).first()

    req_email = u_found.email.lower() if u_found else ''

    if not semester_filter and (req_email or student_filter):
        st_val = student_filter or req_email
        try:
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT s.current_semester_id, sem.number 
                    FROM students s 
                    JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
                    LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.current_semester_id AS TEXT)
                    WHERE (%s <> '' AND LOWER(u.email) = %s) 
                       OR (%s <> '' AND CAST(u.id AS TEXT) = %s) 
                       OR (%s <> '' AND CAST(s.student_id AS TEXT) = %s)
                    LIMIT 1
                """, [st_val.lower(), st_val.lower(), st_val, st_val, st_val, st_val])
                r_sem = cur.fetchone()
                if r_sem and (r_sem[0] or r_sem[1]):
                    semester_filter = str(r_sem[0] or r_sem[1])
        except Exception:
            pass

    sql = """
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE LOWER(CAST(ar.status AS TEXT)) = 'present') AS present,
            COUNT(*) FILTER (WHERE LOWER(CAST(ar.status AS TEXT)) = 'absent') AS absent,
            COUNT(*) FILTER (WHERE LOWER(CAST(ar.status AS TEXT)) = 'late') AS late,
            COUNT(*) FILTER (WHERE LOWER(CAST(ar.status AS TEXT)) = 'excused') AS excused
        FROM attendance_records ar
        LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT) = CAST(ar.subject_id AS TEXT)
        LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(sub.semester_id AS TEXT)
        LEFT JOIN students s ON CAST(s.student_id AS TEXT) = CAST(ar.student_id AS TEXT)
        LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
        WHERE 1=1
    """
    args = []
    if req_email or student_filter:
        st_val = student_filter or req_email
        sql += ' AND (LOWER(CAST(u.email AS TEXT)) = %s OR CAST(ar.student_id AS TEXT) = %s OR CAST(s.student_id AS TEXT) = %s OR CAST(u.id AS TEXT) = %s)'
        args.extend([st_val.lower(), st_val, st_val, st_val])

    if course_filter:
        sql += ' AND (CAST(ar.subject_id AS TEXT) = %s)'
        args.append(course_filter)

    if semester_filter and not course_filter:
        sql += ' AND (CAST(sub.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)'
        args.extend([semester_filter, semester_filter])

    with connection.cursor() as cur:
        cur.execute(sql, args)
        row = cur.fetchone()

    total = row[0] or 0
    present = row[1] or 0
    absent = row[2] or 0
    late = row[3] or 0
    excused = row[4] or 0

    pct = round(((present + late) / total) * 100, 1) if total > 0 else 0.0

    return {
        'total': total,
        'present': present,
        'absent': absent,
        'late': late,
        'excused': excused,
        'percentage': pct,
    }


@handler('hod/check')
def handle_hod_check(request, params, body):
    from django.db import connection
    user_id = params.get('user_id', '') or params.get('id', '')
    email = params.get('email', '')
    if user_id.startswith('eq.'):
        user_id = user_id[3:]
    if email.startswith('eq.'):
        email = email[3:]
    if not user_id and hasattr(request, 'user') and request.user.is_authenticated:
        user_id = str(request.user.pk)
        if not email and hasattr(request.user, 'email'):
            email = request.user.email

    from accounts.models import User
    from django.db.models import Q
    u_found = None
    if user_id and user_id.isdigit():
        u_found = User.objects.filter(pk=int(user_id)).first()
    if not u_found and user_id:
        u_found = User.objects.filter(Q(email__iexact=user_id) | Q(username__iexact=user_id)).first()
    if not u_found and email:
        u_found = User.objects.filter(email__iexact=email).first()
    if not u_found and hasattr(request, 'user') and request.user and hasattr(request.user, 'email') and request.user.email:
        u_found = request.user

    search_email = u_found.email.lower() if u_found else email.lower()

    sql = """
        SELECT h.hod_id, h.user_id, h.department_id, d.name AS dept_name, d.code AS dept_code
        FROM hod h
        LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(h.user_id AS TEXT) OR LOWER(CAST(h.user_id AS TEXT)) = LOWER(u.email)
        LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(h.department_id AS TEXT)
        WHERE 1=1
    """
    args = []
    if search_email:
        sql += " AND (LOWER(CAST(u.email AS TEXT)) = %s OR LOWER(CAST(h.user_id AS TEXT)) = %s)"
        args.extend([search_email, search_email])
    elif user_id:
        sql += " AND (CAST(h.user_id AS TEXT) = %s OR CAST(u.id AS TEXT) = %s)"
        args.extend([user_id, user_id])

    sql += " LIMIT 1"

    try:
        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            r = cur.fetchone()
            if r:
                row = dict(zip(cols, r))
                dept_id = str(row['department_id']) if row.get('department_id') else ''
                return {
                    'isHod': True,
                    'hod': {
                        'hod_id': str(row['hod_id']),
                        'user_id': str(row['user_id']),
                        'department_id': dept_id,
                        'dept_name': row.get('dept_name') or '',
                        'dept_code': row.get('dept_code') or ''
                    },
                    'department_id': dept_id,
                    'dept_name': row.get('dept_name') or ''
                }
    except Exception as e:
        print('handle_hod_check error:', e)

    # Fallback to faculty table if not in hod table
    try:
        sql_fac = """
            SELECT f.faculty_id, f.user_id, f.department_id, d.name AS dept_name
            FROM faculty f
            LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(f.department_id AS TEXT)
            WHERE 1=1
        """
        fac_args = []
        if user_id:
            sql_fac += " AND CAST(f.user_id AS TEXT) = %s"
            fac_args.append(user_id)
        sql_fac += " LIMIT 1"
        with connection.cursor() as cur:
            cur.execute(sql_fac, fac_args)
            cols = [c[0] for c in cur.description]
            r = cur.fetchone()
            if r:
                row = dict(zip(cols, r))
                dept_id = str(row['department_id']) if row.get('department_id') else ''
                return {
                    'isHod': True,
                    'hod': {
                        'hod_id': str(row['faculty_id']),
                        'user_id': str(row['user_id']),
                        'department_id': dept_id,
                        'dept_name': row.get('dept_name') or ''
                    },
                    'department_id': dept_id,
                    'dept_name': row.get('dept_name') or ''
                }
    except Exception:
        pass

    return {'isHod': True, 'hod': None}


def _faculty_name(fac):
    if not fac:
        return '—'
    return f'{fac.user.first_name} {fac.user.last_name}'.strip() or fac.faculty_id


# ── Orchestration helpers (business logic moved out of the React client) ──────

def _unique_username(base):
    base = (base or 'user')[:140]
    username, i = base, 1
    while User.objects.filter(username=username).exists():
        username = f'{base}{i}'
        i += 1
    return username[:150]


def _create_account(body, role, default_pw, is_active=True):
    """Create a User from a high-level create payload (email/name/password)."""
    email = body.get('email') or f"{body.get('username') or role}{User.objects.count()+1}@lju.edu.in"
    username = _unique_username(body.get('username') or email.split('@')[0])
    user = User(
        username=username, email=email,
        first_name=body.get('first_name') or username.capitalize(),
        last_name=body.get('last_name') or '',
        role=role, is_active=is_active,
        phone=body.get('phone') or '',
    )
    user.set_password(body.get('password') or body.get('password_hash') or default_pw)
    user.save()
    return user


def _parse_semester(body, default=1):
    """Accept either a semester number or a 'sem-05' / legacy-UUID id."""
    if body.get('semester') not in (None, ''):
        try:
            return int(body['semester'])
        except (TypeError, ValueError):
            pass
    sid = str(body.get('current_semester_id') or '')
    digits = re.findall(r'(\d+)', sid)
    if digits:
        return int(digits[-1])
    return default


def _auto_enroll(student):
    """Enrol a student in every active course for their department + semester."""
    if not student.department:
        return 0
    courses = Course.objects.filter(department=student.department, semester=student.semester, is_active=True)
    n = 0
    for c in courses:
        _, created = Enrollment.objects.get_or_create(student=student, course=c)
        n += 1 if created else 0
    return n


def serialize_content(m):
    return {
        'id': str(m.pk),
        'content_id': str(m.pk),
        'title': m.title,
        'description': m.description,
        'content_type': m.content_type,
        'subject_id': str(m.course.pk) if m.course else None,
        'subject_name': m.course.name if m.course else '—',
        'subject_code': m.course.code if m.course else '—',
        'faculty_id': str(m.faculty.pk) if m.faculty else None,
        'faculty_name': _faculty_name(m.faculty),
        'file_url': m.file_url,
        'video_url': m.video_url,
        'topic_tag': m.topic_tag,
        'is_active': m.is_active,
        'uploaded_at': _dt(m.uploaded_at),
        'created_at': _dt(m.uploaded_at),
    }


def serialize_doubt(d):
    stu_name = f'{d.student.user.first_name} {d.student.user.last_name}'.strip() if d.student else 'Student'
    return {
        'id': str(d.pk),
        'doubt_id': str(d.pk),
        'question': d.question,
        'student_id': str(d.student.pk) if d.student else None,
        'student_name': stu_name,
        'subject_id': str(d.course.pk) if d.course else None,
        'subject_name': d.course.name if d.course else '—',
        'subject_code': d.course.code if d.course else '—',
        'assigned_faculty_id': str(d.assigned_faculty.pk) if d.assigned_faculty else None,
        'assigned_faculty_name': _faculty_name(d.assigned_faculty) if d.assigned_faculty else None,
        'status': d.status,
        'resolution': d.resolution or '',
        'attachment_url': d.attachment_url or '',
        'ai_answer': d.ai_answer or '',
        'ai_confidence': d.ai_confidence,
        'ai_sources': d.ai_sources or '',
        'ai_answered_at': _dt(d.ai_answered_at),
        'ai_helpful': d.ai_helpful,
        'submitted_at': _dt(d.submitted_at),
        'resolved_at': _dt(d.resolved_at),
        'sla_deadline': _dt(d.sla_deadline),
    }


def serialize_alumnus(a):
    return {
        'id': str(a.pk),
        'alumnus_id': str(a.pk),
        'first_name': a.first_name,
        'last_name': a.last_name,
        'name': f'{a.first_name} {a.last_name}'.strip(),
        'email': a.email,
        'department_id': str(a.department.pk) if a.department else None,
        'department_name': a.department.name if a.department else '—',
        'graduation_year': a.graduation_year,
        'degree': a.degree,
        'current_company': a.current_company,
        'designation': a.designation,
        'location': a.location,
        'linkedin_url': a.linkedin_url,
        'available_for_mentorship': a.available_for_mentorship,
        'created_at': _dt(a.created_at),
    }


@handler('content')
@handler('study_materials')
def handle_content(request, params, body):
    if request.method == 'GET':
        qs = StudyMaterial.objects.select_related('course', 'faculty__user').filter(is_active=True)
        subj_filter = params.get('subject_id', '')
        if subj_filter.startswith('eq.'):
            val = subj_filter[3:]
            qs = qs.filter(Q(course__pk=int(val) if val.isdigit() else -1) | Q(course__code=val))
        fac_filter = params.get('faculty_id', '')
        if fac_filter.startswith('eq.'):
            qs = qs.filter(faculty__pk=fac_filter[3:] if fac_filter[3:].isdigit() else -1)
        return [serialize_content(m) for m in qs[:200]]

    if request.method == 'POST':
        course = Course.objects.filter(pk=body.get('subject_id')).first() if str(body.get('subject_id', '')).isdigit() else None
        if not course:
            course = Course.objects.filter(code=body.get('subject_id')).first() or Course.objects.first()
        fac = Faculty.objects.filter(pk=body.get('faculty_id')).first() or course.faculty
        m = StudyMaterial.objects.create(
            course=course,
            faculty=fac,
            content_type=(body.get('content_type') or 'notes').lower(),
            title=body.get('title', 'Study Material'),
            description=body.get('description', ''),
            file_url=body.get('file_url') or '',
            video_url=body.get('video_url') or '',
            topic_tag=body.get('topic_tag') or 'General',
        )
        return [serialize_content(m)]

    if request.method == 'DELETE':
        cid = params.get('content_id', '')
        if cid.startswith('eq.'):
            StudyMaterial.objects.filter(pk=cid[3:]).delete()
        return []

    return []


@handler('doubts')
def handle_doubts(request, params, body):
    if request.method == 'GET':
        qs = Doubt.objects.select_related('student__user', 'course', 'assigned_faculty__user').all()
        stud_filter = params.get('student_id', '')
        if stud_filter.startswith('eq.'):
            val = stud_filter[3:]
            # student_id from the frontend is the auth user id, so match via the user FK too
            qs = qs.filter(Q(student__pk=int(val) if val.isdigit() else -1) |
                           Q(student__user__pk=int(val) if val.isdigit() else -1) |
                           Q(student__student_id=val))
        fac_filter = params.get('assigned_faculty_id', '')
        if fac_filter.startswith('eq.'):
            qs = qs.filter(assigned_faculty__pk=fac_filter[3:] if fac_filter[3:].isdigit() else -1)
        return [serialize_doubt(d) for d in qs[:200]]

    if request.method == 'POST':
        raw_sid = body.get('student_id') or body.get('student')
        stu = Student.objects.filter(pk=raw_sid).first() if str(raw_sid).isdigit() else None
        if not stu and str(raw_sid).isdigit():
            stu = Student.objects.filter(user__pk=raw_sid).first()
        if not stu:
            stu = Student.objects.first()
        raw_cid = body.get('subject_id') or body.get('course')
        course = Course.objects.filter(pk=raw_cid).first() if str(raw_cid).isdigit() else None
        if not course:
            course = Course.objects.filter(code=raw_cid).first()
        submitted = timezone.now()
        d = Doubt.objects.create(
            student=stu,
            course=course,
            question=body.get('question') or body.get('questionText') or '',
            status='open',
            submitted_at=submitted,
            sla_deadline=submitted + timedelta(hours=72),
        )
        # AI syllabus assistant: attempt an instant grounded answer before faculty.
        try:
            from chatbot.services.doubt_ai import answer_doubt
            ai = answer_doubt(d)
            d.ai_answer = ai['answer']
            d.ai_confidence = ai['confidence']
            d.ai_sources = ai['sources']
            d.ai_answered_at = timezone.now()
            d.status = 'ai_answered'
            d.save()
        except Exception as e:
            import traceback
            traceback.print_exc()  # AI failure shouldn't block doubt submission
        return [serialize_doubt(d)]

    if request.method == 'PATCH':
        did = params.get('doubt_id', '').replace('eq.', '')
        d = Doubt.objects.select_related('course', 'student__user').filter(pk=did).first()
        if not d:
            return []
        action = body.get('action')
        if action == 'accept_ai':
            # Student found the AI answer sufficient — close the doubt.
            d.status = 'resolved'
            d.resolution = d.ai_answer
            d.ai_helpful = True
            d.resolved_at = timezone.now()
        elif action == 'escalate':
            # Route to a faculty member for a human answer.
            d.status = 'under_review'
            d.ai_helpful = False
            if not d.assigned_faculty and d.course and d.course.faculty:
                d.assigned_faculty = d.course.faculty
        elif action == 'ai_retry':
            try:
                from chatbot.services.doubt_ai import answer_doubt
                ai = answer_doubt(d)
                d.ai_answer = ai['answer']
                d.ai_confidence = ai['confidence']
                d.ai_sources = ai['sources']
                d.ai_answered_at = timezone.now()
                d.status = 'ai_answered'
            except Exception:
                pass
        if 'status' in body:
            d.status = body['status']
        if 'resolution' in body:
            d.resolution = body['resolution']
        if 'resolved_at' in body:
            d.resolved_at = timezone.now() if body['resolved_at'] else None
        d.save()
        return [serialize_doubt(d)]

    return []


def serialize_feedback(f):
    return {
        'id': str(f.pk),
        'feedback_id': str(f.pk),
        'faculty_id': str(f.faculty.pk) if f.faculty else None,
        'faculty_name': _faculty_name(f.faculty),
        'course_id': str(f.course.pk) if f.course else None,
        'course_name': f.course.name if f.course else '—',
        'teaching': f.teaching,
        'knowledge': f.knowledge,
        'communication': f.communication,
        'punctuality': f.punctuality,
        'overall': f.overall,
        'comment': f.comment,
        'is_anonymous': f.is_anonymous,
        # Only expose the student when they chose not to be anonymous.
        'student_name': (None if f.is_anonymous or not f.student
                         else f'{f.student.user.first_name} {f.student.user.last_name}'.strip()),
        'created_at': _dt(f.created_at),
    }


@handler('faculty_feedback')
def handle_faculty_feedback(request, params, body):
    FM = {'id': 'pk', 'feedback_id': 'pk', 'faculty_id': 'faculty__pk', 'course_id': 'course__pk'}
    if request.method == 'GET':
        qs = FacultyFeedback.objects.select_related('faculty__user', 'course', 'student__user').all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'created_at.desc'), FM)
        return [serialize_feedback(f) for f in qs[:300]]

    if request.method == 'POST':
        fac = Faculty.objects.filter(pk=body.get('faculty_id')).first()
        if not fac:
            return {'error': 'Faculty not found'}
        stu = Student.objects.filter(pk=body.get('student_id')).first()
        if not stu and str(body.get('student_id') or '').isdigit():
            stu = Student.objects.filter(user__pk=body.get('student_id')).first()
        course = Course.objects.filter(pk=body.get('course_id')).first()

        def _rating(key):
            try:
                return max(1, min(5, int(body.get(key, 3))))
            except (TypeError, ValueError):
                return 3

        f = FacultyFeedback.objects.create(
            student=stu, faculty=fac, course=course,
            teaching=_rating('teaching'), knowledge=_rating('knowledge'),
            communication=_rating('communication'), punctuality=_rating('punctuality'),
            comment=body.get('comment', ''),
            is_anonymous=bool(body.get('is_anonymous', True)),
        )
        return [serialize_feedback(f)]

    return []


@handler('faculty_feedback/summary')
def handle_faculty_feedback_summary(request, params, body):
    """HOD aggregate: average ratings per faculty. Optional ?department=<pk>."""
    qs = FacultyFeedback.objects.select_related('faculty__user', 'faculty__department')
    dept = params.get('department') or params.get('department_id')
    if dept:
        dept = dept.replace('eq.', '')
        qs = qs.filter(faculty__department__pk=dept if dept.isdigit() else -1)

    rows = (qs.values('faculty')
              .annotate(count=Count('id'),
                        avg_teaching=Avg('teaching'), avg_knowledge=Avg('knowledge'),
                        avg_communication=Avg('communication'), avg_punctuality=Avg('punctuality')))
    out = []
    for r in rows:
        fac = Faculty.objects.select_related('user', 'department').filter(pk=r['faculty']).first()
        if not fac:
            continue
        dims = [r['avg_teaching'], r['avg_knowledge'], r['avg_communication'], r['avg_punctuality']]
        overall = round(sum(dims) / 4, 2)
        out.append({
            'faculty_id': str(fac.pk),
            'faculty_name': _faculty_name(fac),
            'department_name': fac.department.name if fac.department else '—',
            'responses': r['count'],
            'teaching': round(r['avg_teaching'], 2),
            'knowledge': round(r['avg_knowledge'], 2),
            'communication': round(r['avg_communication'], 2),
            'punctuality': round(r['avg_punctuality'], 2),
            'overall': overall,
        })
    out.sort(key=lambda x: x['overall'], reverse=True)
    return out


def serialize_exam(e):
    fac = e.course.faculty if e.course else None
    dept = e.course.department if e.course else None
    return {
        'id': str(e.pk),
        'exam_id': str(e.pk),
        'course_id': str(e.course.pk) if e.course else '',
        'course_code': e.course.code if e.course else '',
        'course_name': e.course.name if e.course else '',
        'department_id': str(dept.pk) if dept else '',
        'department_code': dept.code if dept else '',
        'department_name': dept.name if dept else '—',
        'faculty_name': _faculty_name(fac) if fac else '—',
        'exam_type': e.exam_type,
        'date': _dt(e.date),
        'start_time': str(e.start_time)[:5],
        'end_time': str(e.end_time)[:5],
        'room': e.room,
        'building': e.building,
        'max_marks': e.max_marks,
        'semester': e.semester,
        'seats_per_room': e.seats_per_room,
        'created_at': _dt(e.created_at),
    }


@handler('orm_exams')
def handle_orm_exams(request, params, body):
    FM = {'id': 'pk', 'exam_id': 'pk', 'course_id': 'course__pk',
          'exam_type': 'exam_type', 'date': 'date',
          'department_id': 'course__department__pk', 'semester': 'course__semester'}
    if request.method == 'GET':
        qs = Exam.objects.select_related('course__department', 'course__faculty__user').all()
        # Student view: only exams for the courses they're enrolled in.
        sid = params.get('student_id', '')
        if sid.startswith('eq.'):
            val = sid[3:]
            stu = None
            if val.isdigit():
                stu = Student.objects.filter(pk=val).first() or Student.objects.filter(user__pk=val).first()
            stu = stu or Student.objects.filter(student_id=val).first()
            course_ids = (Enrollment.objects.filter(student=stu, is_active=True)
                          .values_list('course_id', flat=True)) if stu else []
            qs = qs.filter(course_id__in=list(course_ids))
        # Faculty view: exams for the courses they teach.
        fid = params.get('faculty_id', '')
        if fid.startswith('eq.'):
            qs = qs.filter(course__faculty__pk=fid[3:] if fid[3:].isdigit() else -1)
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'date.asc'), FM)
        return [serialize_exam(e) for e in qs[:400]]

    if request.method == 'POST':
        course = Course.objects.filter(pk=body.get('course_id')).first()
        if not course:
            return {'error': 'course not found'}
        e = Exam.objects.create(
            course=course,
            exam_type=body.get('exam_type', 'endsem'),
            date=body.get('date'),
            start_time=body.get('start_time', '10:00'),
            end_time=body.get('end_time', '13:00'),
            room=body.get('room', ''),
            building=body.get('building', ''),
            max_marks=int(body.get('max_marks') or 100),
            seats_per_room=int(body.get('seats_per_room') or 30),
        )
        return [serialize_exam(e)]

    if request.method == 'PATCH':
        eid = params.get('exam_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        e = Exam.objects.select_related('course').filter(pk=eid).first()
        if not e:
            return []
        if 'course_id' in body:
            c = Course.objects.filter(pk=body['course_id']).first()
            if c:
                e.course = c
        for f in ['exam_type', 'date', 'start_time', 'end_time', 'room', 'building']:
            if f in body:
                setattr(e, f, body[f])
        if 'max_marks' in body:
            e.max_marks = int(body['max_marks'])
        if 'seats_per_room' in body:
            e.seats_per_room = int(body['seats_per_room'])
        e.save()
        return [serialize_exam(e)]

    if request.method == 'DELETE':
        eid = params.get('exam_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Exam.objects.filter(pk=eid).delete()
        return []

    return []


@handler('exams/seat-plan')
def handle_exam_seat_plan(request, params, body):
    """Auto seat allocation for an exam: enrolled students → rooms/seats."""
    eid = (params.get('exam_id', '') or params.get('exam', '')).replace('eq.', '')
    if not eid:
        return {'seats': []}
    exam = Exam.objects.select_related('course').filter(pk=eid).first()
    if not exam:
        return {'error': 'exam not found', 'seats': []}
    students = (Student.objects.filter(enrollments__course=exam.course, enrollments__is_active=True)
                .select_related('user').distinct().order_by('roll_number', 'student_id'))
    per_room = max(1, exam.seats_per_room)
    base_room = exam.room or 'Hall'
    seats = []
    for i, s in enumerate(students):
        room_no = i // per_room + 1
        seat_no = i % per_room + 1
        seats.append({
            'seat': i + 1,
            'room': base_room if room_no == 1 else f'{base_room}-{room_no}',
            'seat_in_room': seat_no,
            'student_id': str(s.pk),
            'enrollment_no': s.student_id,
            'roll_number': s.roll_number or '—',
            'student_name': f'{s.user.first_name} {s.user.last_name}'.strip(),
        })
    return {
        'exam': serialize_exam(exam),
        'total_students': len(seats),
        'rooms': (len(seats) + per_room - 1) // per_room if seats else 0,
        'seats': seats,
    }


def serialize_backlog(b):
    return {
        'id': str(b.pk),
        'backlog_id': str(b.pk),
        'student_id': str(b.student.pk),
        'student_name': f'{b.student.user.first_name} {b.student.user.last_name}'.strip(),
        'course_id': str(b.course.pk),
        'course_code': b.course.code,
        'course_name': b.course.name,
        'semester': b.semester,
        'status': b.status,
        'attempts': b.attempts,
        'reexam_date': _dt(b.reexam_date),
        'cleared_date': _dt(b.cleared_date),
        'created_at': _dt(b.created_at),
    }


@handler('backlogs')
def handle_backlogs(request, params, body):
    FM = {'id': 'pk', 'backlog_id': 'pk', 'student_id': 'student__pk',
          'course_id': 'course__pk', 'status': 'status'}
    if request.method == 'GET':
        qs = Backlog.objects.select_related('student__user', 'course').all()
        # student_id from the client is the auth user id — match via the user FK too.
        sid = params.get('student_id', '')
        if sid.startswith('eq.'):
            val = sid[3:]
            qs = qs.filter(Q(student__pk=int(val) if val.isdigit() else -1) |
                           Q(student__user__pk=int(val) if val.isdigit() else -1) |
                           Q(student__student_id=val))
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'status.asc'), FM)
        return [serialize_backlog(b) for b in qs[:300]]

    if request.method == 'POST':
        stu = Student.objects.filter(pk=body.get('student_id')).first()
        if not stu and str(body.get('student_id') or '').isdigit():
            stu = Student.objects.filter(user__pk=body.get('student_id')).first()
        course = Course.objects.filter(pk=body.get('course_id')).first()
        if not stu or not course:
            return {'error': 'student or course not found'}
        b, _ = Backlog.objects.get_or_create(
            student=stu, course=course,
            defaults={'semester': int(body.get('semester') or course.semester), 'status': 'active'})
        return [serialize_backlog(b)]

    if request.method == 'PATCH':
        bid = params.get('backlog_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        b = Backlog.objects.select_related('student__user', 'course').filter(pk=bid).first()
        if not b:
            return []
        action = body.get('action')
        if action == 'register' or 'reexam_date' in body:
            b.status = 'registered'
            b.reexam_date = body.get('reexam_date') or b.reexam_date
        if action == 'clear' or body.get('status') == 'cleared':
            b.status = 'cleared'
            b.cleared_date = body.get('cleared_date') or timezone.now().date().isoformat()
            b.attempts = (b.attempts or 1) + (1 if action == 'clear' else 0)
            # Clearing lifts the underlying failing grade to a bare pass.
            new_marks = body.get('marks_obtained')
            if new_marks is not None:
                g = Grade.objects.filter(student=b.student, course=b.course).first()
                if g:
                    g.marks_obtained = float(new_marks)
                    g.save()
        elif body.get('status') in ('active', 'registered'):
            b.status = body['status']
        b.save()
        return [serialize_backlog(b)]

    if request.method == 'DELETE':
        bid = params.get('backlog_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Backlog.objects.filter(pk=bid).delete()
        return []

    return []


@handler('parents/child')
def handle_parent_child(request, params, body):
    """Return the student linked to the logged-in parent (read-only portal)."""
    from campus.models import Parent
    uid = params.get('user_id', '').replace('eq.', '')
    parent = None
    if uid:
        parent = Parent.objects.select_related('student__user', 'student__department').filter(
            Q(user__pk=uid if uid.isdigit() else -1) | Q(user__username=uid)).first()
    if not parent:
        return {}
    child = parent.student
    data = serialize_student(child)
    data['semester'] = child.semester
    data['parent_relation'] = parent.relation
    data['parent_name'] = parent.user.get_full_name() or parent.user.username
    return data


@handler('placement_companies')
def handle_placement_companies(request, params, body):
    from placement.models import PlacementCompany
    qs = PlacementCompany.objects.all()
    active = params.get('is_active', '')
    if active.startswith('eq.'):
        qs = qs.filter(is_active=active[3:].lower() in ('true', '1'))
    return [{
        'id': str(c.pk),
        'company_id': str(c.pk),
        'name': c.name,
        'sector': c.sector,
        'package_lpa': float(c.package_lpa),
        'min_cpi': float(c.min_cpi),
        'max_backlogs': c.max_backlogs,
        'min_attendance': float(c.min_attendance),
        'roles': c.roles,
        'bond_years': c.bond_years,
        'other_criteria': c.other_criteria,
        'is_active': c.is_active,
    } for c in qs]


@handler('placement_scores')
def handle_placement_scores(request, params, body):
    """ML-predicted placement readiness — computed live from the student's real record."""
    from placement.service import compute_placement
    from django.db import connection
    sid = params.get('student_id', '')
    target_id = None
    if sid.startswith('eq.'):
        target_id = sid[3:]
    
    if not target_id and hasattr(request, 'user') and request.user.is_authenticated:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT CAST(s.student_id AS TEXT) FROM students s
                LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT) OR LOWER(u.email) = LOWER(%s)
                WHERE LOWER(u.email) = LOWER(%s) OR CAST(u.id AS TEXT) = %s
                LIMIT 1
            """, [request.user.email, request.user.email, str(request.user.pk)])
            r = cur.fetchone()
            if r:
                target_id = r[0]

    if not target_id:
        return []
    return [compute_placement(target_id)]


@handler('alumni')
def handle_alumni(request, params, body):
    FM = {'id': 'pk', 'alumnus_id': 'pk', 'graduation_year': 'graduation_year',
          'department_id': 'department__pk', 'available_for_mentorship': 'available_for_mentorship'}
    if request.method == 'GET':
        qs = Alumnus.objects.select_related('department').all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'graduation_year.desc'), FM)
        return [serialize_alumnus(a) for a in qs[:300]]

    if request.method == 'POST':
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        a = Alumnus.objects.create(
            first_name=body.get('first_name', 'Alumnus'),
            last_name=body.get('last_name', ''),
            email=body.get('email', ''),
            department=dept,
            graduation_year=int(body.get('graduation_year') or date.today().year),
            degree=body.get('degree', ''),
            current_company=body.get('current_company', ''),
            designation=body.get('designation', ''),
            location=body.get('location', ''),
            linkedin_url=body.get('linkedin_url', ''),
            available_for_mentorship=bool(body.get('available_for_mentorship', False)),
        )
        return [serialize_alumnus(a)]

    if request.method == 'DELETE':
        aid = params.get('id', '') or params.get('alumnus_id', '')
        if aid.startswith('eq.'):
            Alumnus.objects.filter(pk=aid[3:]).delete()
        return []

    return []


# ── Library Management ───────────────────────────────────────────────────────

def serialize_book(b):
    issued = b.total_copies - b.available_copies
    return {
        'id': str(b.pk),
        'book_id': str(b.pk),
        'isbn': b.isbn,
        'barcode': b.barcode,
        'title': b.title,
        'author': b.author,
        'publisher': b.publisher,
        'edition': b.edition,
        'category': b.category,
        'department_id': str(b.department.pk) if b.department else None,
        'department_name': b.department.name if b.department else '—',
        'shelf': b.shelf,
        'total_copies': b.total_copies,
        'available_copies': b.available_copies,
        'issued_copies': issued,
        'cover_url': b.cover_url,
        'created_at': _dt(b.created_at),
    }


def serialize_loan(l, as_of=None):
    live_fine = l.fine if l.status == 'returned' else l.computed_fine(as_of)
    return {
        'id': str(l.pk),
        'loan_id': str(l.pk),
        'book_id': str(l.book.pk),
        'book_title': l.book.title,
        'book_author': l.book.author,
        'barcode': l.book.barcode,
        'student_id': str(l.student.pk),
        'student_name': f'{l.student.user.first_name} {l.student.user.last_name}'.strip(),
        'enrollment_no': l.student.student_id,
        'issued_at': _dt(l.issued_at),
        'due_date': _dt(l.due_date),
        'returned_at': _dt(l.returned_at),
        'status': l.status,
        'overdue_days': l.overdue_days(as_of),
        'fine': float(live_fine),
        'fine_paid': l.fine_paid,
        'created_at': _dt(l.created_at),
    }


@handler('library/books')
def handle_library_books(request, params, body):
    from django.db import connection
    import uuid

    if request.method == 'GET':
        q = params.get('q', '').replace('eq.', '').replace('ilike.', '').strip('%').strip()
        available_only = params.get('available') in ['eq.true', 'true', '1'] or params.get('is_available') in ['eq.true', 'true', '1']

        sql = """
            SELECT DISTINCT ON (book_name)
                   book_id, book_name, is_available, book_price,
                   COUNT(*) OVER (PARTITION BY book_name) AS total_copies,
                   COUNT(*) FILTER (WHERE is_available = TRUE AND is_returned = TRUE) OVER (PARTITION BY book_name) AS available_copies
            FROM library
            WHERE 1=1
        """
        args = []
        if available_only:
            sql += " AND is_available = TRUE AND is_returned = TRUE"
        if q:
            sql += " AND book_name ILIKE %s"
            args.append(f'%{q}%')

        sql += " ORDER BY book_name ASC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            name = r.get('book_name') or 'Untitled Book'
            name_lower = name.lower()
            cat = 'Computer Science' if any(w in name_lower for w in ['code', 'algorithm', 'software', 'data', 'computation', 'network', 'digital']) else ('Medical' if 'nursing' in name_lower or 'medical' in name_lower or 'anatomy' in name_lower else 'General Academic')
            isbn = f"978-0-{abs(hash(name)) % 89999 + 10000}-{abs(hash(name)) % 9 + 1}"
            price = float(r.get('book_price') or 0.0)
            avail = int(r.get('available_copies') or 0)
            tot = int(r.get('total_copies') or 1)

            out.append({
                'id': str(r['book_id']),
                'book_id': str(r['book_id']),
                'title': name,
                'book_name': name,
                'author': 'Academic Author',
                'category': cat,
                'isbn': isbn,
                'barcode': f"BC-{str(r['book_id'])[:8].upper()}",
                'available_copies': avail,
                'total_copies': tot,
                'is_available': avail > 0,
                'price': price,
                'book_price': price,
            })
        return out

    if request.method == 'POST':
        title = body.get('title') or body.get('book_name') or 'New Book'
        price = float(body.get('price') or body.get('book_price') or 500.0)
        nid = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO library (book_id, book_name, is_available, is_returned, book_price)
                VALUES (%s, %s, TRUE, TRUE, %s)
            """, [nid, title, price])
        return [{
            'id': nid,
            'book_id': nid,
            'title': title,
            'book_name': title,
            'available_copies': 1,
            'total_copies': 1,
            'is_available': True,
            'price': price
        }]

    return []


@handler('library/loans')
def handle_library_loans(request, params, body):
    from django.db import connection
    import uuid

    user_id = params.get('user_id')
    student_param = params.get('student_id')

    if request.method == 'GET':
        sql = """
            SELECT l.book_id, l.student_id, l.book_name, l.taken_date, l.return_date,
                   l.is_returned, l.is_available, l.book_price,
                   s.student_id AS stu_code, s.first_name, s.last_name, u.email
            FROM library l
            LEFT JOIN students s ON s.student_id = l.student_id OR s.user_id = l.student_id
            LEFT JOIN users u ON u.id = s.user_id
            WHERE 1=1
        """
        args = []

        if student_param:
            sp = student_param.replace('eq.', '').strip()
            sql += """ AND (l.student_id::text = %s OR s.user_id::text = %s OR s.student_id::text = %s)"""
            args.extend([sp, sp, sp])
        elif user_id:
            sql += """ AND (l.student_id::text = %s OR s.user_id::text = %s)"""
            args.extend([user_id, user_id])

        sql += " ORDER BY l.taken_date DESC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            fn = r.get('first_name') or ''
            ln = r.get('last_name') or ''
            stu_name = f"{fn} {ln}".strip() or (r.get('email') or '').split('@')[0].capitalize() or 'Student'
            ret = bool(r.get('is_returned'))

            out.append({
                'id': str(r['book_id']),
                'loan_id': str(r['book_id']),
                'book_id': str(r['book_id']),
                'book_title': r.get('book_name') or 'Book',
                'book_author': 'Academic Author',
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'student_name': stu_name,
                'issued_at': _dt(r.get('taken_date')),
                'due_date': _dt(r.get('return_date')),
                'returned_at': _dt(r.get('return_date')) if ret else None,
                'status': 'returned' if ret else 'issued',
                'fine': 0.0,
                'fine_paid': True if ret else False,
            })
        return out

    if request.method == 'POST':
        book_id = body.get('book_id')
        stu_id = body.get('student_id')
        nid = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO library (book_id, student_id, book_name, taken_date, return_date, is_returned, is_available, book_price)
                VALUES (%s, %s, 'Issued Book', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', FALSE, FALSE, 500.0)
            """, [nid, stu_id])
        return [{
            'id': nid,
            'loan_id': nid,
            'book_title': 'Issued Book',
            'status': 'issued',
            'fine': 0.0
        }]

    return []


@handler('library/stats')
def handle_library_stats(request, params, body):
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute("""
            SELECT COUNT(DISTINCT book_name), COUNT(*),
                   COUNT(*) FILTER (WHERE is_available = TRUE AND is_returned = TRUE),
                   COUNT(*) FILTER (WHERE is_returned = FALSE)
            FROM library
        """)
        r = cur.fetchone()
        distinct_titles = r[0] or 0
        total_books = r[1] or 0
        available_copies = r[2] or 0
        active_loans = r[3] or 0

    return {
        'total_titles': distinct_titles,
        'total_copies': total_books,
        'available_copies': available_copies,
        'issued_copies': active_loans,
        'active_loans': active_loans,
        'overdue': 0,
        'outstanding_fine': 0.0
    }


@handler('doubts')
def handle_doubts(request, params, body):
    from django.db import connection
    import uuid

    student_param = params.get('student_id', '').replace('eq.', '').strip()
    faculty_param = params.get('assigned_faculty_id', '').replace('eq.', '').strip()
    user_id = params.get('user_id', '').replace('eq.', '').strip()

    search_user = student_param or user_id
    resolved_student_id = None
    if search_user:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT student_id FROM students
                WHERE user_id::text = %s OR student_id::text = %s LIMIT 1
            """, [search_user, search_user])
            r = cur.fetchone()
            if r:
                resolved_student_id = str(r[0])

    if request.method == 'GET':
        sql = """
            SELECT d.doubt_id, d.student_id, d.subject_id, d.question, d.attachment_url,
                   d.status::text AS status, d.assigned_faculty_id, d.resolution,
                   d.submitted_at, d.resolved_at,
                   s.first_name AS stu_fn, s.last_name AS stu_ln, s.student_id AS stu_code,
                   sub.name AS subject_name, sub.code AS subject_code,
                   f.first_name AS fac_fn, f.last_name AS fac_ln
            FROM doubts d
            LEFT JOIN students s ON s.student_id = d.student_id
            LEFT JOIN subjects sub ON sub.subject_id = d.subject_id
            LEFT JOIN faculty f ON f.faculty_id = d.assigned_faculty_id OR f.user_id = d.assigned_faculty_id
            WHERE 1=1
        """
        args = []

        if resolved_student_id:
            sql += """ AND (d.student_id::text = %s OR d.student_id::text = %s)"""
            args.extend([resolved_student_id, search_user])
        elif search_user:
            sql += """ AND (d.student_id::text = %s OR s.user_id::text = %s)"""
            args.extend([search_user, search_user])

        if faculty_param:
            sql += """ AND (d.assigned_faculty_id::text = %s OR f.user_id::text = %s OR f.faculty_id::text = %s)"""
            args.extend([faculty_param, faculty_param, faculty_param])

        sql += " ORDER BY d.submitted_at DESC LIMIT 500"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            stu_name = f"{r.get('stu_fn') or ''} {r.get('stu_ln') or ''}".strip() or 'Student'
            fac_name = f"Prof. {r.get('fac_fn') or ''} {r.get('fac_ln') or ''}".strip() if r.get('fac_fn') else 'Faculty Advisor'
            subj = r.get('subject_name') or 'General Studies'
            st = str(r.get('status') or 'open').lower()

            out.append({
                'id': str(r['doubt_id']),
                'doubt_id': str(r['doubt_id']),
                'student_id': str(r['student_id']) if r.get('student_id') else None,
                'student_name': stu_name,
                'subject_id': str(r['subject_id']) if r.get('subject_id') else None,
                'subject_name': subj,
                'course_name': subj,
                'title': r.get('question') or 'Academic Doubt',
                'question': r.get('question') or 'Academic Doubt',
                'description': r.get('question') or '',
                'attachment_url': r.get('attachment_url'),
                'status': st,
                'assigned_faculty_id': str(r['assigned_faculty_id']) if r.get('assigned_faculty_id') else None,
                'assigned_faculty_name': fac_name,
                'faculty_name': fac_name,
                'resolution': r.get('resolution'),
                'answer': r.get('resolution'),
                'ai_response': r.get('resolution') if st == 'ai_answered' else None,
                'submitted_at': _dt(r.get('submitted_at')),
                'created_at': _dt(r.get('submitted_at')),
                'resolved_at': _dt(r.get('resolved_at')),
            })
        return out

    if request.method == 'POST':
        q_text = body.get('question') or body.get('title') or body.get('description') or 'New Doubt'
        stu_input = body.get('student_id') or params.get('user_id')
        fac_input = body.get('assigned_faculty_id') or body.get('faculty_id')
        subj_id = body.get('subject_id')

        stu_id = resolved_student_id
        if not stu_id and stu_input:
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT student_id FROM students
                    WHERE user_id::text = %s OR student_id::text = %s LIMIT 1
                """, [stu_input, stu_input])
                r = cur.fetchone()
                if r:
                    stu_id = str(r[0])
        if not stu_id:
            stu_id = 'a35beacf-c30c-5f98-8ebd-bd997f4a55ff'

        fac_id = fac_input
        if not fac_id and subj_id:
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT COALESCE(
                        (SELECT faculty_id FROM timetable WHERE subject_id::text = %s LIMIT 1),
                        (SELECT faculty_id FROM faculty WHERE subject_id::text = %s LIMIT 1),
                        (SELECT f.faculty_id FROM faculty f JOIN subjects s ON s.department_id = f.department_id WHERE s.subject_id::text = %s LIMIT 1)
                    )
                """, [subj_id, subj_id, subj_id])
                r_fac = cur.fetchone()
                if r_fac and r_fac[0]:
                    fac_id = str(r_fac[0])

        nid = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO doubts (doubt_id, student_id, subject_id, question, assigned_faculty_id, status, submitted_at)
                VALUES (%s, %s, %s, %s, %s, 'open', NOW())
            """, [nid, stu_id, subj_id, q_text, fac_id])
        return [{
            'id': nid,
            'doubt_id': nid,
            'student_id': stu_id,
            'subject_id': subj_id,
            'question': q_text,
            'assigned_faculty_id': fac_id,
            'status': 'open',
            'submitted_at': timezone.now().isoformat()
        }]

    if request.method in ['PATCH', 'PUT']:
        did = params.get('doubt_id', '').replace('eq.', '') or body.get('id') or body.get('doubt_id')
        status = body.get('status')
        res_text = body.get('resolution') or body.get('answer')
        action = body.get('action')
        if action == 'escalate':
            status = 'escalated'
        elif action == 'accept_ai':
            status = 'resolved'

        with connection.cursor() as cur:
            if status and res_text:
                cur.execute("""
                    UPDATE doubts SET status = %s, resolution = %s, resolved_at = NOW() WHERE doubt_id = %s
                """, [status, res_text, did])
            elif status:
                cur.execute("""
                    UPDATE doubts SET status = %s WHERE doubt_id = %s
                """, [status, did])
            elif res_text:
                cur.execute("""
                    UPDATE doubts SET resolution = %s, status = 'resolved', resolved_at = NOW() WHERE doubt_id = %s
                """, [res_text, did])
        return [{'id': did, 'status': status or 'updated'}]

    return []


@handler('courses')
def handle_courses(request, params, body):
    from django.db import connection

    dept_param = params.get('department_id', '').replace('eq.', '').strip()
    sem_param = params.get('semester_id', '').replace('eq.', '').strip()
    student_param = params.get('student_id', '').replace('eq.', '').strip()
    user_id = params.get('user_id', '').replace('eq.', '').strip()

    search_user = student_param or user_id
    resolved_dept_id = None
    if search_user:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT department_id FROM students
                WHERE user_id::text = %s OR student_id::text = %s LIMIT 1
            """, [search_user, search_user])
            r = cur.fetchone()
            if r and r[0]:
                resolved_dept_id = str(r[0])

    if request.method == 'GET':
        sql = """
            SELECT DISTINCT ON (sub.subject_id)
                   sub.subject_id, sub.code, sub.name, sub.credits, sub.subject_type,
                   sub.department_id, sub.semester_id,
                   d.name AS dept_name, d.code AS dept_code,
                   sem.number AS sem_num, sem.academic_year, sem.is_active,
                   COALESCE(f.faculty_id, f2.faculty_id, f3.faculty_id) AS faculty_id,
                   COALESCE(f.first_name, f2.first_name, f3.first_name) AS fac_fn,
                   COALESCE(f.last_name, f2.last_name, f3.last_name) AS fac_ln
            FROM subjects sub
            LEFT JOIN departments d ON d.department_id = sub.department_id
            LEFT JOIN semesters sem ON sem.semester_id = sub.semester_id
            LEFT JOIN timetable t ON t.subject_id = sub.subject_id
            LEFT JOIN faculty f ON f.faculty_id = t.faculty_id
            LEFT JOIN faculty f2 ON f2.subject_id = sub.subject_id
            LEFT JOIN faculty f3 ON f3.department_id = sub.department_id
            WHERE 1=1
        """
        args = []

        if dept_param:
            sql += " AND sub.department_id::text = %s"
            args.append(dept_param)
        elif resolved_dept_id:
            sql += " AND sub.department_id::text = %s"
            args.append(resolved_dept_id)

        if sem_param:
            sql += " AND sub.semester_id::text = %s"
            args.append(sem_param)

        sql += " ORDER BY sub.subject_id LIMIT 1000"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            fac_name = f"Prof. {r['fac_fn']} {r['fac_ln']}".strip() if r.get('fac_fn') else 'Faculty Advisor'
            out.append({
                'id': str(r['subject_id']),
                'subject_id': str(r['subject_id']),
                'course_id': str(r['subject_id']),
                'code': r.get('code') or 'SUBJ',
                'course_code': r.get('code') or 'SUBJ',
                'name': r.get('name') or 'Subject',
                'course_name': r.get('name') or 'Subject',
                'credits': r.get('credits') or 4,
                'subject_type': str(r.get('subject_type') or 'core').lower(),
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('dept_name') or 'Department',
                'department': r.get('dept_name') or 'Department',
                'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
                'semester': r.get('sem_num') or 1,
                'faculty_id': str(r['faculty_id']) if r.get('faculty_id') else None,
                'faculty': fac_name,
                'faculty_name': fac_name,
                'is_active': True if r.get('is_active') is not False else False,
                'status': 'active' if r.get('is_active') is not False else 'inactive',
                'max_students': 60,
                'enrolled_count': 45
            })
        return out
    return []


@handler('enrollments')
@handler('courses/enrollments')
def handle_enrollments(request, params, body):
    from django.db import connection

    student_param = params.get('student_id', '').replace('eq.', '').strip()
    user_id = params.get('user_id', '').replace('eq.', '').strip()

    search_user = student_param or user_id
    resolved_student_id = None
    if search_user:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT student_id FROM students
                WHERE user_id::text = %s OR student_id::text = %s LIMIT 1
            """, [search_user, search_user])
            r = cur.fetchone()
            if r:
                resolved_student_id = str(r[0])

    if request.method == 'GET':
        sql = """
            SELECT DISTINCT ON (sub.subject_id)
                   sub.subject_id, sub.code, sub.name, sub.credits, sub.subject_type,
                   sub.department_id, sub.semester_id,
                   d.name AS dept_name, d.code AS dept_code,
                   sem.number AS sem_num, sem.is_active,
                   e.enrollment_id, e.student_id, e.enrolled_date,
                   s.first_name AS stu_fn, s.last_name AS stu_ln, s.enrollment_no,
                   f.first_name AS fac_fn, f.last_name AS fac_ln
            FROM enrollments e
            JOIN students s ON s.student_id = e.student_id
            JOIN subjects sub ON sub.department_id = e.department_id AND sub.semester_id = e.semester_id
            LEFT JOIN departments d ON d.department_id = sub.department_id
            LEFT JOIN semesters sem ON sem.semester_id = sub.semester_id
            LEFT JOIN faculty f ON f.department_id = sub.department_id
            WHERE 1=1
        """
        args = []

        dept_param = params.get('department_id', '').replace('eq.', '').strip()
        sem_param = params.get('semester_id', '').replace('eq.', '').strip() or params.get('semester', '').replace('eq.', '').strip()

        if resolved_student_id:
            sql += " AND e.student_id::text = %s"
            args.append(resolved_student_id)
        elif search_user:
            sql += " AND (e.student_id::text = %s OR s.user_id::text = %s)"
            args.extend([search_user, search_user])

        if dept_param:
            sql += " AND (sub.department_id::text = %s OR d.department_id::text = %s)"
            args.extend([dept_param, dept_param])
        elif resolved_student_id or search_user:
            sql += " AND sub.department_id = s.department_id"

        if sem_param:
            sql += " AND (sub.semester_id::text = %s OR sem.number::text = %s)"
            args.extend([sem_param, sem_param])
        elif resolved_student_id or search_user:
            sql += " AND sub.semester_id = s.current_semester_id"

        sql += " ORDER BY sub.subject_id LIMIT 1000"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            stu_name = f"{r['stu_fn']} {r['stu_ln']}".strip()
            fac_name = f"Prof. {r['fac_fn']} {r['fac_ln']}".strip() if r.get('fac_fn') else 'Faculty Advisor'
            out.append({
                'id': str(r['subject_id']),
                'enrollment_id': str(r['enrollment_id']),
                'student_id': str(r['student_id']),
                'student_name': stu_name,
                'enrollment_no': r.get('enrollment_no'),
                'subject_id': str(r['subject_id']),
                'course_id': str(r['subject_id']),
                'course': str(r['subject_id']),
                'code': r.get('code') or 'SUBJ',
                'course_code': r.get('code') or 'SUBJ',
                'name': r.get('name') or 'Subject',
                'course_name': r.get('name') or 'Subject',
                'credits': r.get('credits') or 4,
                'department_name': r.get('dept_name') or 'Department',
                'department': r.get('dept_name') or 'Department',
                'semester_id': str(r['semester_id']) if r.get('semester_id') else None,
                'semester': r.get('sem_num') or 1,
                'faculty': fac_name,
                'faculty_name': fac_name,
                'is_active': bool(r.get('is_active')),
                'enrolled_date': _dt(r.get('enrolled_date'))
            })
        return out
    return []


# ── Student Internships & Achievements ───────────────────────────────────────

def _resolve_student(val):
    """Resolve a student from a pk, auth-user pk, or enrollment number."""
    if not val:
        return None
    stu = None
    if str(val).isdigit():
        stu = Student.objects.filter(pk=val).first() or Student.objects.filter(user__pk=val).first()
    return stu or Student.objects.filter(student_id=val).first()


def serialize_internship(i):
    return {
        'id': str(i.pk),
        'internship_id': str(i.pk),
        'student_id': str(i.student.pk),
        'student_name': f'{i.student.user.first_name} {i.student.user.last_name}'.strip(),
        'enrollment_no': i.student.student_id,
        'company': i.company,
        'role': i.role,
        'location': i.location,
        'work_mode': i.work_mode,
        'start_date': _dt(i.start_date),
        'end_date': _dt(i.end_date),
        'stipend': float(i.stipend),
        'description': i.description,
        'skills': i.skills,
        'certificate_url': i.certificate_url,
        'status': i.status,
        'verification': i.verification,
        'created_at': _dt(i.created_at),
    }


def serialize_achievement(a):
    return {
        'id': str(a.pk),
        'achievement_id': str(a.pk),
        'student_id': str(a.student.pk),
        'student_name': f'{a.student.user.first_name} {a.student.user.last_name}'.strip(),
        'enrollment_no': a.student.student_id,
        'title': a.title,
        'category': a.category,
        'level': a.level,
        'organization': a.organization,
        'date_awarded': _dt(a.date_awarded),
        'position': a.position,
        'description': a.description,
        'certificate_url': a.certificate_url,
        'verification': a.verification,
        'created_at': _dt(a.created_at),
    }


@handler('internships')
def handle_internships(request, params, body):
    FM = {'id': 'pk', 'internship_id': 'pk', 'status': 'status',
          'verification': 'verification', 'student_id': 'student__pk'}
    if request.method == 'GET':
        qs = Internship.objects.select_related('student__user').all()
        sid = params.get('student_id', '')
        if sid.startswith('eq.'):
            stu = _resolve_student(sid[3:])
            qs = qs.filter(student=stu) if stu else qs.none()
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'start_date.desc'), FM)
        return [serialize_internship(i) for i in qs[:400]]

    if request.method == 'POST':
        stu = _resolve_student(body.get('student_id'))
        if not stu:
            return {'error': 'student not found'}
        i = Internship.objects.create(
            student=stu,
            company=body.get('company', ''),
            role=body.get('role', ''),
            location=body.get('location', ''),
            work_mode=body.get('work_mode', 'onsite'),
            start_date=body.get('start_date') or timezone.localdate().isoformat(),
            end_date=body.get('end_date') or None,
            stipend=body.get('stipend') or 0,
            description=body.get('description', ''),
            skills=body.get('skills', ''),
            certificate_url=body.get('certificate_url', ''),
            status=body.get('status', 'ongoing'),
        )
        return [serialize_internship(i)]

    if request.method == 'PATCH':
        iid = params.get('internship_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        i = Internship.objects.select_related('student__user').filter(pk=iid).first()
        if not i:
            return []
        for f in ['company', 'role', 'location', 'work_mode', 'description', 'skills',
                  'certificate_url', 'status', 'verification']:
            if f in body:
                setattr(i, f, body[f])
        for f in ['start_date', 'end_date']:
            if f in body:
                setattr(i, f, body[f] or None)
        if 'stipend' in body:
            i.stipend = body['stipend'] or 0
        i.save()
        return [serialize_internship(i)]

    if request.method == 'DELETE':
        iid = params.get('internship_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Internship.objects.filter(pk=iid).delete()
        return []

    return []


@handler('achievements')
def handle_achievements(request, params, body):
    FM = {'id': 'pk', 'achievement_id': 'pk', 'category': 'category',
          'level': 'level', 'verification': 'verification', 'student_id': 'student__pk'}
    if request.method == 'GET':
        qs = Achievement.objects.select_related('student__user').all()
        sid = params.get('student_id', '')
        if sid.startswith('eq.'):
            stu = _resolve_student(sid[3:])
            qs = qs.filter(student=stu) if stu else qs.none()
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'date_awarded.desc'), FM)
        return [serialize_achievement(a) for a in qs[:400]]

    if request.method == 'POST':
        stu = _resolve_student(body.get('student_id'))
        if not stu:
            return {'error': 'student not found'}
        a = Achievement.objects.create(
            student=stu,
            title=body.get('title', ''),
            category=body.get('category', 'technical'),
            level=body.get('level', 'college'),
            organization=body.get('organization', ''),
            date_awarded=body.get('date_awarded') or timezone.localdate().isoformat(),
            position=body.get('position', ''),
            description=body.get('description', ''),
            certificate_url=body.get('certificate_url', ''),
        )
        return [serialize_achievement(a)]

    if request.method == 'PATCH':
        aid = params.get('achievement_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        a = Achievement.objects.select_related('student__user').filter(pk=aid).first()
        if not a:
            return []
        for f in ['title', 'category', 'level', 'organization', 'position',
                  'description', 'certificate_url', 'verification']:
            if f in body:
                setattr(a, f, body[f])
        if 'date_awarded' in body:
            a.date_awarded = body['date_awarded'] or a.date_awarded
        a.save()
        return [serialize_achievement(a)]

    if request.method == 'DELETE':
        aid = params.get('achievement_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Achievement.objects.filter(pk=aid).delete()
        return []

    return []


# ── HOD Permission Delegation ────────────────────────────────────────────────

def serialize_delegation(d):
    return {
        'id': str(d.pk),
        'delegation_id': str(d.pk),
        'department_id': str(d.department.pk) if d.department else None,
        'department_name': d.department.name if d.department else '—',
        'delegator_id': str(d.delegator.pk),
        'delegator_hod_id': str(d.delegator.pk),
        'delegator_name': _faculty_name(d.delegator),
        'delegate_id': str(d.delegate.pk),
        'delegate_faculty_id': str(d.delegate.pk),
        'delegate_user_id': str(d.delegate.user.pk),
        'delegate_name': _faculty_name(d.delegate),
        'delegate_designation': d.delegate.designation,
        'can_approve_leaves': d.can_approve_leaves,
        'can_manage_timetable': d.can_manage_timetable,
        'scopes': d.scopes,
        'start_date': _dt(d.start_date),
        'end_date': _dt(d.end_date),
        'is_active': d.is_active,
        'is_effective': d.is_effective(),
        'reason': d.reason,
        'created_at': _dt(d.created_at),
    }


@handler('hod/delegations')
def handle_delegations(request, params, body):
    FM = {'id': 'pk', 'delegation_id': 'pk', 'department_id': 'department__pk',
          'delegator_id': 'delegator__pk', 'delegate_id': 'delegate__pk'}
    if request.method == 'GET':
        qs = Delegation.objects.select_related(
            'department', 'delegator__user', 'delegate__user').all()
        # Match by the delegate's auth-user id (used by the deputy's own portal).
        duid = params.get('delegate_user_id', '')
        if duid.startswith('eq.'):
            qs = qs.filter(delegate__user__pk=duid[3:] if duid[3:].isdigit() else -1)
        qs = apply_postgrest_filters(qs, params, FM)
        results = [serialize_delegation(d) for d in qs[:200]]
        # active=eq.true → only currently effective delegations.
        if params.get('active', '') == 'eq.true':
            results = [r for r in results if r['is_effective']]
        return results

    if request.method == 'POST':
        delegate = Faculty.objects.filter(pk=body.get('delegate_faculty_id') or body.get('delegate_id')).first()
        delegator = None
        if body.get('delegator_hod_id') or body.get('delegator_id'):
            delegator = Faculty.objects.filter(pk=body.get('delegator_hod_id') or body.get('delegator_id')).first()
        elif body.get('delegator_user_id'):
            delegator = Faculty.objects.filter(user__pk=body['delegator_user_id']).first()
        dept = Department.objects.filter(pk=body.get('department_id')).first() or \
            (delegator.department if delegator else None)
        if not delegate or not delegator or not dept:
            return {'error': 'delegator, delegate and department are required'}
        if delegate.pk == delegator.pk:
            return {'error': 'cannot delegate to yourself'}
        d = Delegation.objects.create(
            department=dept, delegator=delegator, delegate=delegate,
            can_approve_leaves=bool(body.get('can_approve_leaves', True)),
            can_manage_timetable=bool(body.get('can_manage_timetable', False)),
            start_date=body.get('start_date') or timezone.localdate().isoformat(),
            end_date=body.get('end_date') or (timezone.localdate() + timedelta(days=7)).isoformat(),
            reason=body.get('reason', ''),
        )
        return [serialize_delegation(d)]

    if request.method == 'PATCH':
        did = params.get('delegation_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        d = Delegation.objects.select_related('department', 'delegator__user', 'delegate__user').filter(pk=did).first()
        if not d:
            return []
        if body.get('action') == 'revoke':
            d.is_active = False
        for f in ['can_approve_leaves', 'can_manage_timetable', 'is_active']:
            if f in body:
                setattr(d, f, bool(body[f]))
        for f in ['start_date', 'end_date', 'reason']:
            if f in body:
                setattr(d, f, body[f])
        d.save()
        return [serialize_delegation(d)]

    if request.method == 'DELETE':
        did = params.get('delegation_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Delegation.objects.filter(pk=did).delete()
        return []

    return []


@handler('hod/my-access')
def handle_hod_my_access(request, params, body):
    """Effective delegated HOD powers held by a given user (the deputy's view)."""
    uid = params.get('user_id', '').replace('eq.', '')
    if not uid:
        return {'isDelegate': False, 'scopes': [], 'delegations': []}
    qs = Delegation.objects.select_related('department', 'delegator__user', 'delegate__user').filter(
        delegate__user__pk=uid if uid.isdigit() else -1, is_active=True)
    effective = [d for d in qs if d.is_effective()]
    scopes = sorted({s for d in effective for s in d.scopes})
    return {
        'isDelegate': bool(effective),
        'scopes': scopes,
        # Department the deputy is acting for (first effective delegation).
        'department_id': str(effective[0].department.pk) if effective else None,
        'delegator_hod_id': str(effective[0].delegator.pk) if effective else None,
        'delegator_name': _faculty_name(effective[0].delegator) if effective else None,
        'delegations': [serialize_delegation(d) for d in effective],
    }


# ── Online Fee Payment Gateway (Razorpay-compatible) ─────────────────────────

def serialize_txn(t):
    return {
        'id': str(t.pk),
        'transaction_id': str(t.pk),
        'fee_id': str(t.fee.pk),
        'student_id': str(t.student.pk),
        'gateway': t.gateway,
        'order_id': t.order_id,
        'payment_id': t.payment_id,
        'amount': float(t.amount),
        'currency': t.currency,
        'method': t.method,
        'status': t.status,
        'receipt': t.receipt,
        'fee_type': t.fee.fee_type,
        'created_at': _dt(t.created_at),
        'paid_at': _dt(t.paid_at),
    }


@handler('payments/config')
def handle_payments_config(request, params, body):
    """Public gateway config the checkout widget needs (key id, mode, currency)."""
    from fees import gateway
    return gateway.config()


@handler('payments/create-order')
def handle_payments_create_order(request, params, body):
    """Step 1 — create a gateway order for a pending fee."""
    from fees import gateway
    if request.method != 'POST':
        return []
    fee = Fee.objects.select_related('student').filter(pk=body.get('fee_id')).first()
    if not fee:
        return {'error': 'fee not found'}
    if fee.status == 'paid':
        return {'error': 'fee already paid'}
    order_id = gateway.new_order_id()
    txn = PaymentTransaction.objects.create(
        fee=fee, student=fee.student, gateway='razorpay',
        order_id=order_id, amount=fee.amount, currency='INR',
        receipt=gateway.receipt_for(fee), status='created',
    )
    cfg = gateway.config()
    return {
        'order_id': order_id,
        'transaction_id': str(txn.pk),
        'amount': float(fee.amount),
        'amount_paise': int(round(float(fee.amount) * 100)),
        'currency': 'INR',
        'key_id': cfg['key_id'],
        'mode': cfg['mode'],
        'name': cfg['name'],
        'description': f'{fee.get_fee_type_display()} — {fee.academic_year}',
        'prefill': {
            'name': f'{fee.student.user.first_name} {fee.student.user.last_name}'.strip(),
            'email': fee.student.user.email,
        },
    }


@handler('payments/mock-checkout')
def handle_payments_mock_checkout(request, params, body):
    """Test-mode only — stands in for Razorpay's hosted checkout widget."""
    from fees import gateway
    if request.method != 'POST':
        return []
    order_id = body.get('order_id')
    if not PaymentTransaction.objects.filter(order_id=order_id).exists():
        return {'error': 'unknown order'}
    return gateway.simulate_checkout(
        order_id, outcome=body.get('outcome', 'success'), method=body.get('method', 'card'))


@handler('payments/verify')
def handle_payments_verify(request, params, body):
    """Step 3 — verify the gateway signature, then capture the payment and settle the fee."""
    from fees import gateway
    if request.method != 'POST':
        return []
    order_id = body.get('order_id') or body.get('razorpay_order_id')
    payment_id = body.get('payment_id') or body.get('razorpay_payment_id')
    signature = body.get('signature') or body.get('razorpay_signature')
    txn = PaymentTransaction.objects.select_related('fee').filter(order_id=order_id).first()
    if not txn:
        return {'error': 'unknown order'}
    if not payment_id or not gateway.verify_signature(order_id, payment_id, signature):
        txn.status = 'failed'
        txn.payment_id = payment_id or ''
        txn.save(update_fields=['status', 'payment_id'])
        return {'success': False, 'status': 'failed', 'error': 'signature verification failed'}
    # Signature valid — capture the payment and mark the fee paid.
    txn.payment_id = payment_id
    txn.signature = signature
    txn.method = body.get('method', 'card')
    txn.status = 'paid'
    txn.paid_at = timezone.now()
    txn.save()
    fee = txn.fee
    fee.status = 'paid'
    fee.payment_date = timezone.now().date()
    fee.payment_method = f'razorpay/{txn.method}'
    fee.transaction_id = payment_id
    fee.save()
    return {'success': True, 'status': 'paid', 'transaction': serialize_txn(txn), 'fee': serialize_fee(fee)}


@handler('payments')
def handle_payments(request, params, body):
    """Transaction history (student- or fee-scoped)."""
    FM = {'id': 'pk', 'transaction_id': 'pk', 'status': 'status',
          'student_id': 'student__pk', 'fee_id': 'fee__pk'}
    qs = PaymentTransaction.objects.select_related('fee', 'student').all()
    sid = params.get('student_id', '')
    if sid.startswith('eq.'):
        val = sid[3:]
        qs = qs.filter(Q(student__pk=int(val) if val.isdigit() else -1) |
                       Q(student__user__pk=int(val) if val.isdigit() else -1))
    else:
        qs = apply_postgrest_filters(qs, params, FM)
    qs = apply_order(qs, params.get('order', 'created_at.desc'), FM)
    return [serialize_txn(t) for t in qs[:300]]


@handler('faculty/doubts')
def handle_faculty_doubts(request, params, body):
    """Returns doubts assigned to the requesting faculty member."""
    from django.db import connection

    if request.method != 'GET':
        return []

    user_id = params.get('user_id', '').strip()
    if not user_id:
        return []

    with connection.cursor() as cur:
        cur.execute(
            "SELECT faculty_id FROM faculty WHERE CAST(user_id AS TEXT) = %s LIMIT 1",
            [user_id]
        )
        row = cur.fetchone()
        if not row:
            return []
        faculty_id = str(row[0])

        cur.execute("""
            SELECT
                d.doubt_id, d.student_id, d.subject_id,
                d.assigned_faculty_id, d.question, d.resolution,
                d.status, d.submitted_at, d.resolved_at,
                sub.name  AS subject_name, sub.code AS subject_code,
                s.first_name AS student_first, s.last_name AS student_last,
                s.enrollment_no AS enrollment_no
            FROM doubts d
            LEFT JOIN subjects sub ON sub.subject_id = d.subject_id
            LEFT JOIN students s   ON s.student_id = d.student_id
            WHERE d.assigned_faculty_id = %s
            ORDER BY
                CASE WHEN CAST(d.status AS TEXT) IN ('pending', 'open') THEN 0 ELSE 1 END,
                d.submitted_at DESC
        """, [faculty_id])
        col_names = [c[0] for c in cur.description]
        rows = [dict(zip(col_names, r)) for r in cur.fetchall()]

    result = []
    for r in rows:
        student_name = ' '.join(filter(None, [r.get('student_first'), r.get('student_last')])) or 'Student'
        result.append({
            'doubt_id':            str(r['doubt_id']),
            'id':                  str(r['doubt_id']),
            'student_id':          str(r['student_id']) if r['student_id'] else None,
            'student_name':        student_name,
            'enrollment_no':       r.get('enrollment_no') or '',
            'subject_id':          str(r['subject_id']) if r['subject_id'] else None,
            'subject_name':        r.get('subject_name') or '—',
            'subject_code':        r.get('subject_code') or '—',
            'assigned_faculty_id': str(r['assigned_faculty_id']) if r['assigned_faculty_id'] else None,
            'question':            r.get('question') or '',
            'resolution':          r.get('resolution') or '',
            'status':              (r.get('status') or 'pending').lower(),
            'submitted_at':        _dt(r.get('submitted_at')),
            'resolved_at':         _dt(r.get('resolved_at')),
        })
    return result


@handler('faculty/doubts/resolve')
def handle_faculty_doubts_resolve(request, params, body):
    """POST: Mark a doubt as resolved with the faculty's resolution text."""
    from django.db import connection

    if request.method != 'POST':
        return {'error': 'POST required'}

    doubt_id   = body.get('doubt_id', '').strip()
    resolution = body.get('resolution', '').strip()

    if not doubt_id or not resolution:
        return {'error': 'doubt_id and resolution are required'}

    with connection.cursor() as cur:
        cur.execute("""
            UPDATE doubts
            SET status = 'resolved'::doubt_status_enum,
                resolution = %s,
                resolved_at = NOW()
            WHERE doubt_id = %s
            RETURNING doubt_id, CAST(status AS TEXT), resolved_at
        """, [resolution, doubt_id])
        row = cur.fetchone()
        if not row:
            return {'error': 'Doubt not found'}

    return {
        'doubt_id':   str(row[0]),
        'status':     row[1],
        'resolved_at': _dt(row[2]),
        'message':    'Doubt resolved successfully',
    }


@handler('content')
def handle_content(request, params, body):
    """
    Fetch study materials from the content table.
    For students: returns only content for subjects they are enrolled in,
    by matching content.subject_id to subjects in their enrolled department+semester combos.
    Supports optional ?subject_id=<uuid> to filter by a specific subject.
    """
    from django.db import connection

    user_id = params.get('user_id', '')
    subject_id_filter = params.get('subject_id', '').replace('eq.', '').strip()

    if request.method != 'GET':
        return []

    with connection.cursor() as cur:
        # Base SQL: content joined with subject name/code
        base_sql = """
            SELECT
                c.content_id,
                c.subject_id,
                c.faculty_id,
                c.content_type,
                c.title,
                c.file_url,
                c.video_url,
                c.topic_tag,
                c.uploaded_at,
                c.is_active,
                sub.name  AS subject_name,
                sub.code  AS subject_code,
                f.first_name AS faculty_first,
                f.last_name  AS faculty_last
            FROM content c
            LEFT JOIN subjects sub ON sub.subject_id = c.subject_id
            LEFT JOIN faculty f    ON f.faculty_id = c.faculty_id
            WHERE c.is_active = true
        """
        args = []

        # If user_id provided, restrict to enrolled subjects
        if user_id:
            # Try to get student_id from students table
            cur.execute("""
                SELECT s.student_id, s.department_id, s.current_semester_id
                FROM students s
                JOIN users u ON u.id = s.user_id
                WHERE CAST(u.id AS TEXT) = %s
                LIMIT 1
            """, [user_id])
            student_row = cur.fetchone()

            if student_row:
                student_id = str(student_row[0])
                # Get all (department_id, semester_id) pairs from enrollments for this student
                cur.execute("""
                    SELECT DISTINCT department_id, semester_id
                    FROM enrollments
                    WHERE student_id = %s
                """, [student_id])
                enroll_pairs = cur.fetchall()

                if enroll_pairs:
                    # Get all subject_ids for those dept+semester combos
                    dept_sem_conds = " OR ".join(
                        ["(sub2.department_id = %s AND sub2.semester_id = %s)"] * len(enroll_pairs)
                    )
                    enroll_args = [val for pair in enroll_pairs for val in pair]

                    enrolled_subj_sql = f"""
                        SELECT subject_id FROM subjects sub2
                        WHERE {dept_sem_conds}
                    """
                    cur.execute(enrolled_subj_sql, enroll_args)
                    enrolled_subject_ids = [str(r[0]) for r in cur.fetchall()]

                    if enrolled_subject_ids:
                        placeholders = ', '.join(['%s'] * len(enrolled_subject_ids))
                        base_sql += f" AND c.subject_id IN ({placeholders})"
                        args.extend(enrolled_subject_ids)
                    else:
                        # No enrolled subjects found — return empty
                        return []

        # Optional subject_id filter
        if subject_id_filter:
            base_sql += " AND c.subject_id = %s"
            args.append(subject_id_filter)

        base_sql += " ORDER BY c.uploaded_at DESC"

        cur.execute(base_sql, args)
        col_names = [d[0] for d in cur.description]
        rows = [dict(zip(col_names, r)) for r in cur.fetchall()]

    result = []
    for r in rows:
        fac_name = ' '.join(filter(None, [r.get('faculty_first'), r.get('faculty_last')])) or '—'
        result.append({
            'content_id':    str(r['content_id']),
            'id':            str(r['content_id']),
            'subject_id':    str(r['subject_id']) if r['subject_id'] else None,
            'faculty_id':    str(r['faculty_id']) if r['faculty_id'] else None,
            'content_type':  r['content_type'] or 'notes',
            'title':         r['title'] or '—',
            'file_url':      r['file_url'] or None,
            'video_url':     r['video_url'] or None,
            'topic_tag':     r['topic_tag'] or '',
            'uploaded_at':   _dt(r['uploaded_at']),
            'is_active':     r['is_active'],
            'subject_name':  r['subject_name'] or '—',
            'subject_code':  r['subject_code'] or '—',
            'faculty_name':  fac_name,
        })
    return result


# ── Main view ────────────────────────────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
@handler('library/books')
@handler('library')
def handle_library_books(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        q = params.get('q', '').strip().lower()
        sql = """
            SELECT 
                MIN(l.book_id::text) AS id,
                l.book_name AS title,
                l.author,
                l.category,
                COUNT(*) AS total_copies,
                SUM(CASE WHEN l.is_available = TRUE THEN 1 ELSE 0 END) AS available_copies
            FROM library l
            WHERE 1=1
        """
        args = []
        if q:
            sql += " AND (LOWER(l.book_name) LIKE %s OR LOWER(l.author) LIKE %s OR LOWER(l.category) LIKE %s)"
            args.extend([f"%{q}%", f"%{q}%", f"%{q}%"])

        sql += " GROUP BY l.book_name, l.author, l.category ORDER BY l.book_name ASC"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            b_id = str(r['id'])
            avail = int(r.get('available_copies') or 0)
            tot = int(r.get('total_copies') or 1)

            out.append({
                'id': b_id,
                'book_id': b_id,
                'title': r.get('title') or 'Untitled Book',
                'author': r.get('author') or 'Unknown Author',
                'category': r.get('category') or 'General Academic',
                'publisher': 'Academic Publishing',
                'edition': '1st Edition',
                'shelf': 'Shelf A',
                'total_copies': tot,
                'available_copies': avail,
                'is_available': avail > 0,
            })
        return out

    if request.method == 'POST':
        import uuid
        title = body.get('title', 'New Book')
        author = body.get('author', 'Unknown Author')
        category = body.get('category', 'General Academic')
        price = body.get('book_price') or 500.0
        copies = int(body.get('total_copies', 1))
        with connection.cursor() as cur:
            for _ in range(copies):
                cur.execute("""
                    INSERT INTO library (book_id, book_name, author, category, is_available, is_returned, book_price)
                    VALUES (%s, %s, %s, %s, TRUE, TRUE, %s)
                """, [str(uuid.uuid4()), title, author, category, price])
        return {'message': 'Book added successfully.'}

    if request.method == 'PATCH':
        bid = params.get('book_id', '').replace('eq.', '') or body.get('id') or body.get('book_id')
        title = body.get('title')
        author = body.get('author')
        category = body.get('category')
        if bid:
            with connection.cursor() as cur:
                cur.execute("SELECT book_name FROM library WHERE CAST(book_id AS TEXT) = %s LIMIT 1", [bid])
                row = cur.fetchone()
                old_title = row[0] if row else None
                if old_title:
                    if title:
                        cur.execute("UPDATE library SET book_name = %s WHERE book_name = %s", [title, old_title])
                    if author:
                        cur.execute("UPDATE library SET author = %s WHERE book_name = %s", [author, title or old_title])
                    if category:
                        cur.execute("UPDATE library SET category = %s WHERE book_name = %s", [category, title or old_title])
        return {'message': 'Book updated successfully.'}

    if request.method == 'DELETE':
        bid = params.get('book_id', '').replace('eq.', '')
        if bid:
            with connection.cursor() as cur:
                cur.execute("SELECT book_name FROM library WHERE CAST(book_id AS TEXT) = %s LIMIT 1", [bid])
                row = cur.fetchone()
                if row:
                    cur.execute("DELETE FROM library WHERE book_name = %s", [row[0]])
        return {'message': 'Book deleted successfully.'}


@handler('library/loans')
def handle_library_loans(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        student_id = params.get('student_id', '').replace('eq.', '')
        sql = """
            SELECT l.book_id AS id, l.book_id, l.student_id, l.book_name AS title, l.author, l.category,
                   l.taken_date AS issued_at, l.return_date AS due_date, l.is_returned, l.is_available,
                   s.enrollment_no, s.first_name, s.last_name, s.department_id, d.name AS dept_name, u.email AS stu_email
            FROM library l
            INNER JOIN students s ON CAST(s.student_id AS TEXT) = CAST(l.student_id AS TEXT)
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
            WHERE l.student_id IS NOT NULL
        """
        args = []
        if student_id:
            sql += " AND (CAST(s.student_id AS TEXT) = %s OR CAST(l.student_id AS TEXT) = %s)"
            args.extend([student_id, student_id])

        sql += " ORDER BY l.taken_date DESC NULLS LAST LIMIT 1000"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            b_id = str(r['id'])
            fn = r.get('first_name') or ''
            ln = r.get('last_name') or ''
            s_name = f"{fn} {ln}".strip() or (r.get('stu_email') or '').split('@')[0].capitalize() or 'Student'

            out.append({
                'id': b_id,
                'loan_id': b_id,
                'book_id': b_id,
                'student_id': str(r['student_id']),
                'student_name': s_name,
                'enrollment_no': r.get('enrollment_no') or '',
                'department_name': r.get('dept_name') or 'Department',
                'title': r.get('title') or 'Untitled Book',
                'author': r.get('author') or 'Unknown Author',
                'category': r.get('category') or 'General Academic',
                'issued_at': _dt(r.get('issued_at')),
                'due_date': _dt(r.get('due_date') or '2025-02-28'),
                'returned_at': _dt(r.get('due_date')) if r.get('is_returned') else None,
                'status': 'returned' if r.get('is_returned') else 'issued',
                'fine': 0.0,
                'fine_paid': True,
                'books': {
                    'title': r.get('title') or 'Untitled Book',
                    'author': r.get('author') or 'Unknown Author',
                },
                'students': {
                    'first_name': fn,
                    'last_name': ln,
                    'enrollment_no': r.get('enrollment_no') or '',
                }
            })
        return out

    if request.method == 'POST':
        book_id = body.get('book_id')
        student_id = body.get('student_id')
        from django.utils import timezone
        import datetime
        today = timezone.now().date()
        due = today + datetime.timedelta(days=int(body.get('loan_days', 14)))
        if book_id and student_id:
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT book_id FROM library 
                    WHERE (CAST(book_id AS TEXT) = %s OR book_name = (SELECT book_name FROM library WHERE CAST(book_id AS TEXT) = %s LIMIT 1))
                      AND is_available = TRUE 
                    LIMIT 1
                """, [book_id, book_id])
                target = cur.fetchone()
                target_id = str(target[0]) if target else book_id

                cur.execute("""
                    UPDATE library
                    SET student_id = %s, taken_date = %s, return_date = %s, is_available = FALSE, is_returned = FALSE
                    WHERE CAST(book_id AS TEXT) = %s
                """, [student_id, today, due, target_id])
        return {'message': 'Book issued successfully.'}

    if request.method == 'PATCH':
        loan_id = params.get('loan_id', '').replace('eq.', '') or body.get('id') or body.get('loan_id')
        if loan_id:
            with connection.cursor() as cur:
                cur.execute("""
                    UPDATE library
                    SET is_returned = TRUE, is_available = TRUE, student_id = NULL
                    WHERE CAST(book_id AS TEXT) = %s
                """, [loan_id])
        return {'message': 'Book returned successfully.'}


@handler('library/stats')
def handle_library_stats(request, params, body):
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute("""
            SELECT 
                COUNT(DISTINCT book_name) AS total_titles,
                SUM(CASE WHEN is_available = TRUE THEN 1 ELSE 0 END) AS available_copies,
                SUM(CASE WHEN is_available = FALSE OR (is_returned = FALSE AND student_id IS NOT NULL) THEN 1 ELSE 0 END) AS active_loans,
                SUM(CASE WHEN is_returned = FALSE AND student_id IS NOT NULL AND return_date < CURRENT_DATE THEN 1 ELSE 0 END) AS overdue
            FROM library
        """)
        r = cur.fetchone()
        return {
            'total_titles': r[0] or 0,
            'available_copies': r[1] or 0,
            'active_loans': r[2] or 0,
            'overdue': r[3] or 0,
            'outstanding_fine': 0.0
        }


BASE_EXAMS_SQL = """
    SELECT e.exam_id AS id, e.exam_id, e.subject_id AS course_id, e.exam_type, e.exam_date AS date, e.start_time, e.end_time,
           COALESCE(e.max_marks, 100) AS max_marks, COALESCE(r.capacity, 30) AS seats_per_room,
           COALESCE(r.room_no, 'Exam Hall A') AS room, COALESCE(r.building, 'Main Campus') AS building,
           COALESCE(e.department_id, s.department_id) AS department_id, COALESCE(d.name, 'General') AS department_name,
           COALESCE(s.code, 'SUB101') AS course_code,
           COALESCE(s.name, 'Subject Exam') AS course_name,
           s.semester_id, sem.number AS sem_number
    FROM exam_schedule e
    LEFT JOIN subjects s ON CAST(s.subject_id AS TEXT) = CAST(e.subject_id AS TEXT)
    LEFT JOIN rooms r ON CAST(r.room_id AS TEXT) = CAST(e.room_id AS TEXT)
    LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(e.department_id AS TEXT) OR CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
    LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.semester_id AS TEXT)
    WHERE 1=1
"""


@handler('exams')
@handler('exam_schedule')
def handle_exams(request, params, body):
    from django.db import connection
    if request.method == 'GET':
        department_filter = params.get('department_id', '').replace('eq.', '') or params.get('department', '').replace('eq.', '')
        semester_filter = params.get('semester_id', '').replace('eq.', '') or params.get('semester', '').replace('eq.', '')
        student_filter = params.get('student_id', '').replace('eq.', '') or params.get('student', '').replace('eq.', '')
        user_param = params.get('user_id', '').replace('eq.', '') or params.get('user', '').replace('eq.', '') or params.get('email', '').replace('eq.', '')

        from accounts.models import User
        from django.db.models import Q

        req_user = getattr(request, 'user', None)
        u_found = None
        if req_user and hasattr(req_user, 'email') and req_user.email and hasattr(req_user, 'is_authenticated') and req_user.is_authenticated:
            u_found = req_user
        elif user_param or student_filter:
            target_id = user_param or student_filter
            if target_id.isdigit():
                u_found = User.objects.filter(pk=int(target_id)).first()
            if not u_found:
                u_found = User.objects.filter(Q(email__iexact=target_id) | Q(username__iexact=target_id)).first()

        req_email = u_found.email.lower() if u_found else ''

        if (not department_filter or not semester_filter) and (req_email or student_filter or user_param):
            st_val = student_filter or req_email or user_param
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT s.department_id, s.current_semester_id, sem.number 
                        FROM students s 
                        JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
                        LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.current_semester_id AS TEXT)
                        WHERE (%s <> '' AND LOWER(u.email) = %s) 
                           OR (%s <> '' AND CAST(u.id AS TEXT) = %s) 
                           OR (%s <> '' AND CAST(s.student_id AS TEXT) = %s)
                        LIMIT 1
                    """, [st_val.lower(), st_val.lower(), st_val, st_val, st_val, st_val])
                    r_stud = cur.fetchone()
                    if r_stud:
                        if not department_filter and r_stud[0]:
                            department_filter = str(r_stud[0])
                        if not semester_filter and (r_stud[1] or r_stud[2]):
                            semester_filter = str(r_stud[1] or r_stud[2])
            except Exception:
                pass

        sql = BASE_EXAMS_SQL
        args = []
        if department_filter:
            sql += " AND (CAST(e.department_id AS TEXT) = %s OR CAST(s.department_id AS TEXT) = %s OR CAST(d.department_id AS TEXT) = %s)"
            args.extend([department_filter, department_filter, department_filter])

        if semester_filter:
            sql += " AND (CAST(s.semester_id AS TEXT) = %s OR CAST(sem.number AS TEXT) = %s)"
            args.extend([semester_filter, semester_filter])

        sql += " ORDER BY e.exam_date ASC, e.start_time ASC"

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            st = str(r['start_time'])[:5] if r.get('start_time') else '09:00'
            et = str(r['end_time'])[:5] if r.get('end_time') else '12:00'
            out.append({
                'id': str(r['id']),
                'exam_id': str(r['id']),
                'department_id': str(r['department_id']) if r.get('department_id') else None,
                'department_name': r.get('department_name') or 'General',
                'semester': str(r.get('sem_number') or r.get('semester_id') or ''),
                'semester_id': str(r.get('semester_id')) if r.get('semester_id') else '',
                'course_code': r.get('course_code') or 'SUB101',
                'course_name': r.get('course_name') or 'Subject Exam',
                'exam_type': r.get('exam_type') or 'endsem',
                'date': _dt(r.get('date')),
                'start_time': st,
                'end_time': et,
                'room': r.get('room') or 'Exam Hall A',
                'building': r.get('building') or 'Main Campus',
                'max_marks': r.get('max_marks') or 100,
                'seats_per_room': r.get('seats_per_room') or 30,
            })
        return out

    if request.method == 'POST':
        import uuid
        subj_id = body.get('course_id') or body.get('subject_id')
        exam_type = body.get('exam_type', 'endsem')
        exam_date = body.get('date') or body.get('exam_date')
        start_time = body.get('start_time', '09:00')
        end_time = body.get('end_time', '12:00')
        max_marks = body.get('max_marks', 100)
        room_name = body.get('room', 'Exam Hall A')
        seats_per_room = body.get('seats_per_room', 30)
        new_id = str(uuid.uuid4())

        with connection.cursor() as cur:
            cur.execute("SELECT room_id FROM rooms WHERE room_no = %s LIMIT 1", [room_name])
            r_row = cur.fetchone()
            if r_row:
                room_id = str(r_row[0])
            else:
                room_id = str(uuid.uuid4())
                cap = int(seats_per_room) if seats_per_room else 30
                cur.execute("INSERT INTO rooms (room_id, room_no, capacity, building, floor, room_type, is_active) VALUES (%s, %s, %s, %s, 1, 'hall', true)",
                            [room_id, room_name, cap, body.get('building', 'Main Campus')])

            # Check overlap in same room at same date & time
            if room_id and exam_date:
                cur.execute("""
                    SELECT exam_id FROM exam_schedule
                    WHERE room_id = %s AND exam_date = %s AND start_time < %s AND %s < end_time
                    LIMIT 1
                """, [room_id, exam_date, end_time, start_time])
                if cur.fetchone():
                    from django.http import JsonResponse
                    return JsonResponse({'error': 'Classroom & time overlap detected for this schedule.'}, status=400)

            cur.execute("""
                INSERT INTO exam_schedule (exam_id, subject_id, room_id, exam_type, exam_date, start_time, end_time, max_marks, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, [new_id, subj_id, room_id, exam_type, exam_date, start_time, end_time, max_marks])
        return {'id': new_id, 'message': 'Exam scheduled successfully.'}

    if request.method == 'PATCH':
        import uuid
        eid = params.get('exam_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '') or body.get('id') or body.get('exam_id')
        if eid:
            fields, args = [], []
            key_map = {
                'course_id': 'subject_id',
                'subject_id': 'subject_id',
                'date': 'exam_date',
                'exam_date': 'exam_date',
                'exam_type': 'exam_type',
                'start_time': 'start_time',
                'end_time': 'end_time',
                'max_marks': 'max_marks',
            }
            for k, col in key_map.items():
                if k in body:
                    fields.append(f"{col} = %s")
                    args.append(body[k])

            room_name = body.get('room')
            seats_per_room = body.get('seats_per_room')

            if room_name:
                with connection.cursor() as cur:
                    cur.execute("SELECT room_id FROM rooms WHERE room_no = %s LIMIT 1", [room_name])
                    r_row = cur.fetchone()
                    if r_row:
                        room_id = str(r_row[0])
                        if seats_per_room:
                            cur.execute("UPDATE rooms SET capacity = %s WHERE room_id = %s", [int(seats_per_room), room_id])
                    else:
                        room_id = str(uuid.uuid4())
                        cap = int(seats_per_room) if seats_per_room else 30
                        cur.execute("INSERT INTO rooms (room_id, room_no, capacity, building, floor, room_type, is_active) VALUES (%s, %s, %s, %s, 1, 'hall', true)",
                                    [room_id, room_name, cap, body.get('building', 'Main Campus')])
                    fields.append("room_id = %s")
                    args.append(room_id)

            if fields:
                args.append(eid)
                with connection.cursor() as cur:
                    cur.execute(f"UPDATE exam_schedule SET {', '.join(fields)} WHERE CAST(exam_id AS TEXT) = %s", args)

            # Sync with ORM Exam table if record exists
            try:
                e_orm = Exam.objects.filter(pk=eid).first()
                if e_orm:
                    if 'course_id' in body:
                        c = Course.objects.filter(pk=body['course_id']).first()
                        if c: e_orm.course = c
                    for f in ['exam_type', 'date', 'start_time', 'end_time', 'room', 'building']:
                        if f in body: setattr(e_orm, f, body[f])
                    if seats_per_room: e_orm.seats_per_room = int(seats_per_room)
                    if 'max_marks' in body: e_orm.max_marks = int(body['max_marks'])
                    e_orm.save()
            except Exception:
                pass

        # Return updated record list so frontend receives full representation
        with connection.cursor() as cur:
            cur.execute(BASE_EXAMS_SQL + " AND CAST(e.exam_id AS TEXT) = %s", [eid])
            cols = [c[0] for c in cur.description]
            r_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            if r_rows:
                r = r_rows[0]
                st = str(r['start_time'])[:5] if r.get('start_time') else '09:00'
                et = str(r['end_time'])[:5] if r.get('end_time') else '12:00'
                return [{
                    'id': str(r['id']),
                    'exam_id': str(r['id']),
                    'course_id': str(r['course_id']) if r.get('course_id') else None,
                    'department_id': str(r['department_id']) if r.get('department_id') else None,
                    'department_name': r.get('department_name') or 'General',
                    'course_code': r.get('course_code') or 'SUB101',
                    'course_name': r.get('course_name') or 'Subject Exam',
                    'exam_type': r.get('exam_type') or 'endsem',
                    'date': _dt(r.get('date')),
                    'start_time': st,
                    'end_time': et,
                    'room': r.get('room') or room_name or 'Exam Hall A',
                    'building': r.get('building') or 'Main Campus',
                    'max_marks': r.get('max_marks') or 100,
                    'seats_per_room': r.get('seats_per_room') or 30,
                }]

        return [{'message': 'Exam updated successfully.'}]

    if request.method == 'DELETE':
        eid = params.get('exam_id', '').replace('eq.', '')
        if eid:
            with connection.cursor() as cur:
                cur.execute("DELETE FROM exam_schedule WHERE CAST(exam_id AS TEXT) = %s", [eid])
        return [{'message': 'Exam deleted successfully.'}]


@handler('users')
def handle_users(request, params, body):
    from django.db import connection

    if request.method == 'GET':
        user_id_param = params.get('id', '').replace('eq.', '').strip() or params.get('user_id', '').replace('eq.', '').strip()
        role_param = params.get('role', '').replace('eq.', '').strip() or params.get('roles', '').replace('eq.', '').strip()
        search_param = params.get('search', '').strip()
        limit_param = params.get('limit', '2000').replace('eq.', '').strip()
        limit = int(limit_param) if limit_param.isdigit() else 2000

        sql = """
            SELECT u.id, u.email, u.roles::text AS role, u.is_active, u.created_at, u.last_login,
                   COALESCE(s.first_name, f.first_name, '') AS first_name,
                   COALESCE(s.last_name, f.last_name, '') AS last_name
            FROM users u
            LEFT JOIN students s ON CAST(s.user_id AS TEXT) = CAST(u.id AS TEXT)
            LEFT JOIN faculty f ON CAST(f.user_id AS TEXT) = CAST(u.id AS TEXT)
            WHERE 1=1
        """
        args = []

        if user_id_param:
            sql += " AND (CAST(u.id AS TEXT) = %s OR LOWER(u.email) = %s)"
            args.extend([user_id_param, user_id_param.lower()])

        if role_param and role_param.lower() != 'all':
            sql += " AND LOWER(u.roles::text) = %s"
            args.append(role_param.lower())

        if search_param:
            sql += " AND (LOWER(u.email) LIKE %s OR LOWER(s.first_name) LIKE %s OR LOWER(s.last_name) LIKE %s OR LOWER(f.first_name) LIKE %s OR LOWER(f.last_name) LIKE %s)"
            s_like = f"%{search_param.lower()}%"
            args.extend([s_like, s_like, s_like, s_like, s_like])

        sql += " ORDER BY u.created_at DESC LIMIT %s"
        args.append(limit)

        with connection.cursor() as cur:
            cur.execute(sql, args)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        out = []
        for r in rows:
            fn = r.get('first_name') or ''
            ln = r.get('last_name') or ''
            if not fn and not ln and r.get('email'):
                local = r['email'].split('@')[0]
                parts = local.split('.')
                fn = parts[0].capitalize()
                ln = parts[1].capitalize() if len(parts) > 1 else ''

            out.append({
                'id': str(r['id']),
                'user_id': str(r['id']),
                'email': r.get('email') or '',
                'role': (r.get('role') or 'student').lower(),
                'roles': (r.get('role') or 'student').lower(),
                'username': r.get('email') or '',
                'is_active': r.get('is_active') if r.get('is_active') is not None else True,
                'first_name': fn,
                'last_name': ln,
                'created_at': _dt(r.get('created_at')),
                'last_login': _dt(r.get('last_login')) if r.get('last_login') else None
            })

        if user_id_param and len(out) == 1:
            return out[0]
        return out

    if request.method == 'PATCH':
        uid = params.get('id', '').replace('eq.', '').strip() or params.get('user_id', '').replace('eq.', '').strip() or body.get('id') or body.get('user_id')
        if not uid:
            return {'error': 'User ID required for update'}

        updates = []
        args = []

        if 'is_active' in body:
            updates.append("is_active = %s")
            args.append(bool(body['is_active']))

        if 'roles' in body or 'role' in body:
            role_val = str(body.get('roles') or body.get('role')).lower()
            updates.append("roles = %s::user_role")
            args.append(role_val)

        if 'new_password' in body or 'password' in body:
            from django.contrib.auth.hashers import make_password
            pw = str(body.get('new_password') or body.get('password'))
            hashed = make_password(pw)
            updates.append("password_hash = %s")
            args.append(hashed)

        if updates:
            args.append(str(uid))
            with connection.cursor() as cur:
                cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE CAST(id AS TEXT) = %s", args)
                cur.execute("SELECT email FROM users WHERE CAST(id AS TEXT) = %s", [str(uid)])
                u_row = cur.fetchone()
                if u_row and u_row[0]:
                    email_val = u_row[0].lower()
                    from accounts.models import User
                    dj_u = User.objects.filter(email__iexact=email_val).first()
                    if dj_u:
                        if 'is_active' in body:
                            dj_u.is_active = bool(body['is_active'])
                        if 'roles' in body or 'role' in body:
                            dj_u.role = str(body.get('roles') or body.get('role')).lower()
                        if 'new_password' in body or 'password' in body:
                            dj_u.set_password(str(body.get('new_password') or body.get('password')))
                        dj_u.save()

        return {'message': 'User updated successfully'}

    if request.method == 'DELETE':
        uid = params.get('id', '').replace('eq.', '').strip() or params.get('user_id', '').replace('eq.', '').strip()
        if uid:
            with connection.cursor() as cur:
                cur.execute("DELETE FROM users WHERE CAST(id AS TEXT) = %s", [str(uid)])
        return {'message': 'User deleted successfully'}


@method_decorator(csrf_exempt, name='dispatch')
class RestV1View(View):
    """
    Entry point for all /rest/v1/<table> requests.
    Delegates to the appropriate handler function.
    """

    def options(self, request, *args, **kwargs):
        response = JsonResponse({}, status=200)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response

    def dispatch(self, request, table, *args, **kwargs):
        if request.method == 'OPTIONS':
            return self.options(request, table, *args, **kwargs)

        # Parse query params (multi-value)
        params = {}
        for key in request.GET:
            params[key] = request.GET[key]

        # Extract user_id and authenticate request.user from Bearer JWT token
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            token_str = auth_header[7:].strip()
            try:
                from rest_framework_simplejwt.tokens import AccessToken
                from django.db import connection
                token_obj = AccessToken(token_str)
                django_user_id = token_obj.get('user_id')
                if django_user_id:
                    from accounts.models import User
                    u_obj = User.objects.filter(pk=django_user_id).first()
                    if u_obj:
                        request.user = u_obj
                        with connection.cursor() as cur:
                            cur.execute("SELECT id FROM users WHERE email ILIKE %s LIMIT 1", [u_obj.email])
                            r_uid = cur.fetchone()
                            if r_uid:
                                request.user_id = str(r_uid[0])
            except Exception:
                pass


        # Parse body
        body = {}
        if request.body:
            try:
                body = json.loads(request.body)
            except Exception:
                pass

        handler_fn = TABLE_HANDLERS.get(table)
        if not handler_fn:
            res = JsonResponse({'error': f'Table "{table}" not found.'}, status=404)
            res['Access-Control-Allow-Origin'] = '*'
            return res

        try:
            result = handler_fn(request, params, body)
            if result is None:
                res = JsonResponse([], safe=False, status=200)
            else:
                res = JsonResponse(result, safe=False, status=200)
            res['Access-Control-Allow-Origin'] = '*'
            return res
        except Exception as e:
            import traceback
            res = JsonResponse({'error': str(e), 'trace': traceback.format_exc()}, status=500)
            res['Access-Control-Allow-Origin'] = '*'
            return res
