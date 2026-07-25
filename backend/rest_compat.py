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
    return {
        'student_id': str(s.pk),
        'id': str(s.pk),
        'user_id': str(s.user.pk),
        'enrollment_no': s.student_id,
        'first_name': s.user.first_name,
        'last_name': s.user.last_name,
        'date_of_birth': _dt(s.admission_date),
        'department_id': str(s.department.pk) if s.department else None,
        'current_semester_id': f'sem-{s.semester:02d}',
        'current_rollno': s.roll_number or '',
        'status': s.status,
        'created_at': _dt(s.created_at),
        'user': serialize_user(s.user),
        'department': serialize_dept(s.department),
        'current_semester': {
            'semester_id': f'sem-{s.semester:02d}',
            'number': s.semester,
            'name': f'Semester {s.semester}',
        },
        # Extra convenience fields
        'department_name': s.department.name if s.department else '—',
        'year_of_study': s.year_of_study,
        'email': s.user.email,
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
    return {
        'notice_id': str(n.pk),
        'id': str(n.pk),
        'title': n.title,
        'content': n.content,
        'notice_type': n.notice_type,
        'priority': n.notice_type.upper(),
        'target_audience': n.audience,
        'audience': n.audience,
        'is_active': n.is_active,
        'published_at': _dt(n.created_at),
        'created_at': _dt(n.created_at),
        'author_id': str(n.posted_by.pk) if n.posted_by else None,
        'author': serialize_user(n.posted_by) if n.posted_by else None,
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
            else:
                qs = qs.filter(**{orm_field: val})
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
        qs = Department.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'name.asc'), FM)
        return [serialize_dept(d) for d in qs]

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
    FM = {
        'faculty_id': 'pk', 'id': 'pk', 'user_id': 'user__pk',
        'department_id': 'department__pk', 'employee_id': 'faculty_id',
    }
    if request.method == 'GET':
        qs = Faculty.objects.select_related('user', 'department').all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'faculty_id.asc'), FM)
        limit = int(params.get('limit', 200))
        return [serialize_faculty(f) for f in qs[:limit]]

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
    """HOD table — backed by admin/hod-role users."""
    if request.method == 'GET':
        qs = Faculty.objects.select_related('user', 'department').filter(
            designation='hod'
        )
        user_id = params.get('user_id', '')
        if user_id and user_id.startswith('eq.'):
            qs = qs.filter(user__pk=user_id[3:])
        dept_id = params.get('department_id', '')
        if dept_id and dept_id.startswith('eq.'):
            qs = qs.filter(department__pk=dept_id[3:])
        return [{
            'hod_id': str(f.pk),
            'id': str(f.pk),
            'user_id': str(f.user.pk),
            'department_id': str(f.department.pk) if f.department else None,
            'user': serialize_user(f.user),
            'department': serialize_dept(f.department),
        } for f in qs]

    if request.method == 'POST':
        # Promote a faculty member to HOD. Accepts faculty_id (preferred) or user_id.
        dept_id = body.get('department_id')
        fac = None
        if body.get('faculty_id'):
            fac = Faculty.objects.filter(pk=body['faculty_id']).first()
        elif body.get('user_id'):
            fac = Faculty.objects.filter(user__pk=body['user_id']).first()
        if not fac:
            return {'error': 'Faculty not found.'}
        # A department has one HOD: demote any current HOD of the target department.
        if dept_id:
            Faculty.objects.filter(department__pk=dept_id, designation='hod').exclude(pk=fac.pk) \
                .update(designation='assistant_professor')
            fac.department_id = dept_id
        fac.designation = 'hod'
        fac.save()
        return [{'hod_id': str(fac.pk), 'id': str(fac.pk), 'user_id': str(fac.user.pk),
                 'department_id': str(fac.department.pk) if fac.department else None}]

    if request.method == 'DELETE':
        hod_id_filter = params.get('hod_id', '') or params.get('id', '')
        if hod_id_filter.startswith('eq.'):
            Faculty.objects.filter(pk=hod_id_filter[3:]).update(designation='assistant_professor')
        return []


@handler('semesters')
def handle_semesters(request, params, body):
    return [serialize_semester(n) for n in range(1, 9)]


@handler('students')
def handle_students(request, params, body):
    FM = {
        'student_id': 'pk', 'id': 'pk', 'user_id': 'user__pk',
        'department_id': 'department__pk', 'current_semester_id': 'semester',
        'enrollment_no': 'student_id', 'status': 'status',
    }
    if request.method == 'GET':
        qs = Student.objects.select_related('user', 'department').all()
        qs = apply_postgrest_filters(qs, params, FM)
        # Handle user_id filter specially (string pk)
        uid_filter = params.get('user_id', '')
        if uid_filter.startswith('eq.'):
            qs = qs.filter(user__pk=uid_filter[3:])
        qs = apply_order(qs, params.get('order', 'student_id.asc'), FM)
        limit = int(params.get('limit', 200))
        return [serialize_student(s) for s in qs[:limit]]

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
    FM = {
        'subject_id': 'pk', 'id': 'pk', 'department_id': 'department__pk',
        'faculty_id': 'faculty__pk', 'semester_id': 'semester', 'code': 'code',
    }
    if request.method == 'GET':
        qs = Course.objects.select_related('department', 'faculty__user').all()
        qs = apply_postgrest_filters(qs, params, FM)
        # enrollments subselect handled client-side
        limit = int(params.get('limit', 200))
        qs = apply_order(qs, params.get('order'), FM)
        data = []
        for c in qs[:limit]:
            s = serialize_subject(c)
            s['enrollments'] = [{'student_id': str(e.student.pk)}
                                 for e in c.enrollments.filter(is_active=True)]
            data.append(s)
        return data

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
    FM = {
        'enrollment_id': 'pk', 'student_id': 'student__pk', 'subject_id': 'course__pk',
    }
    if request.method == 'GET':
        qs = Enrollment.objects.select_related('student__user', 'course').all()
        qs = apply_postgrest_filters(qs, params, FM)
        return [serialize_enrollment(e) for e in qs[:200]]

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
def handle_marks(request, params, body):
    FM = {
        'mark_id': 'pk', 'id': 'pk', 'student_id': 'student__pk',
        'subject_id': 'course__pk',
    }
    if request.method == 'GET':
        qs = Grade.objects.select_related('student__user', 'course').all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order'), FM)
        return [serialize_mark(g) for g in qs[:500]]

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

    if request.method == 'PATCH':
        qs = Grade.objects.all()
        mid_filter = params.get('mark_id', '')
        if mid_filter.startswith('eq.'):
            qs = qs.filter(pk=mid_filter[3:])
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
        qs = Grade.objects.all()
        mid_filter = params.get('mark_id', '')
        if mid_filter.startswith('eq.'):
            qs = qs.filter(pk=mid_filter[3:])
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


@handler('attendance_records')
def handle_attendance(request, params, body):
    FM = {
        'record_id': 'pk', 'student_id': 'student__pk', 'subject_id': 'course__pk',
        'date': 'date', 'status': 'status',
    }
    if request.method == 'GET':
        qs = AttendanceRecord.objects.select_related('student__user', 'course').all()
        qs = apply_postgrest_filters(qs, params, FM)
        return [serialize_attendance(a) for a in qs[:500]]

    if request.method == 'POST':
        items = body if isinstance(body, list) else [body]
        results = []
        for item in items:
            stu = Student.objects.filter(pk=item.get('student_id')).first()
            course = Course.objects.filter(pk=item.get('subject_id')).first()
            if not stu or not course:
                continue
            a, _ = AttendanceRecord.objects.get_or_create(
                student=stu, course=course, date=item.get('date'),
                defaults={'status': item.get('status') or 'present'}
            )
            results.append(serialize_attendance(a))
        return results

    return []


@handler('attendance/bulk-mark')
def handle_attendance_bulk(request, params, body):
    """Mark attendance for many students at once (faculty resolution + status
    mapping done server-side)."""
    if request.method != 'POST':
        return []
    marker = User.objects.filter(pk=body.get('marked_by')).first() if body.get('marked_by') else None
    STATUS = {'present': 'present', 'absent': 'absent', 'late': 'late', 'excused': 'excused',
              'P': 'present', 'A': 'absent', 'L': 'late', 'E': 'excused'}
    out = []
    for r in (body.get('records') or []):
        raw_s = r.get('student')
        stu = Student.objects.filter(pk=raw_s).first() if str(raw_s).isdigit() else None
        stu = stu or Student.objects.filter(student_id=raw_s).first()
        raw_c = r.get('course')
        course = Course.objects.filter(pk=raw_c).first() if str(raw_c).isdigit() else None
        course = course or Course.objects.filter(code=raw_c).first()
        if not stu or not course or not r.get('date'):
            continue
        a, _ = AttendanceRecord.objects.update_or_create(
            student=stu, course=course, date=r['date'],
            defaults={'status': STATUS.get(str(r.get('status')), 'present'), 'marked_by': marker})
        out.append(serialize_attendance(a))
    return out


@handler('admin/fees')
def handle_admin_fees(request, params, body):
    """Flat, denormalized fee list for the admin fee console."""
    out = []
    for f in Fee.objects.select_related('student__user', 'student__department').all()[:1000]:
        stu = f.student
        out.append({
            'id': str(f.pk),
            'payment_id': str(f.pk),
            'student_name': f'{stu.user.first_name} {stu.user.last_name}'.strip() or '—',
            'enrollment_no': stu.student_id,
            'department_name': stu.department.name if stu.department else '—',
            'component_name': f.get_fee_type_display(),
            'fee_type': f.fee_type,
            'amount': float(f.amount),
            'amount_paid': float(f.amount) if f.status == 'paid' else 0.0,
            'due_date': _dt(f.due_date),
            'status': f.status,
            'transaction_ref': f.transaction_id or '',
        })
    return out


@handler('fees/mark-paid')
def handle_fee_mark_paid(request, params, body):
    """Mark a single fee record paid, stamping the payment date + a transaction ref."""
    if request.method != 'POST':
        return []
    pid = body.get('payment_id') or (params.get('payment_id', '').replace('eq.', ''))
    fee = Fee.objects.filter(pk=pid).first()
    if not fee:
        return {'error': 'fee not found'}
    fee.status = 'paid'
    fee.payment_date = timezone.now().date()
    fee.transaction_id = body.get('transaction_ref') or f'TXN{int(timezone.now().timestamp())}'
    fee.save()
    return [serialize_fee(fee)]


@handler('fee_payments')
@handler('fees')
def handle_fee_payments(request, params, body):
    FM = {
        'payment_id': 'pk', 'student_id': 'student__pk', 'status': 'status',
    }
    if request.method == 'GET':
        qs = Fee.objects.select_related('student__user', 'student__department').all()
        qs = apply_postgrest_filters(qs, params, FM)
        return [serialize_fee(f) for f in qs[:500]]

    if request.method == 'PATCH':
        qs = Fee.objects.all()
        pid_filter = params.get('payment_id', '')
        if pid_filter.startswith('eq.'):
            qs = qs.filter(pk=pid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        if 'status' in body:
            qs.update(status=body['status'])
        if 'payment_date' in body:
            qs.update(payment_date=body['payment_date'])
        if 'transaction_ref' in body:
            qs.update(transaction_id=body['transaction_ref'])
        return [serialize_fee(f) for f in qs]

    return []


@handler('fee_structures')
def handle_fee_structures(request, params, body):
    """Map fee_structures reads to Fee objects."""
    qs = Fee.objects.all()
    return [serialize_fee(f)['fee_structures'] for f in qs[:200]]


@handler('timetable')
def handle_timetable(request, params, body):
    FM = {
        'timetable_id': 'pk', 'subject_id': 'course__pk',
        'faculty_id': 'faculty__pk', 'day_of_week': 'day',
    }
    if request.method == 'GET':
        qs = Schedule.objects.select_related('course', 'faculty__user').all()
        qs = apply_postgrest_filters(qs, params, FM)
        return [serialize_timetable(t) for t in qs[:200]]

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
    FM = {
        'notice_id': 'pk', 'is_active': 'is_active',
        'target_audience': 'audience', 'priority': 'notice_type',
    }
    if request.method == 'GET':
        qs = Notice.objects.select_related('posted_by').filter(is_active=True)
        # handle target_audience=in.(all,students) style
        aud_filter = params.get('target_audience', '')
        if 'in.' in aud_filter:
            vals = aud_filter.split('in.')[1].strip('()').split(',')
            qs = qs.filter(audience__in=[v.strip() for v in vals])
        qs = apply_order(qs, params.get('order', 'published_at.desc'), FM)
        return [serialize_notice(n) for n in qs[:200]]

    if request.method == 'POST':
        author_id = body.get('author_id')
        poster = User.objects.filter(pk=author_id).first()
        prio = body.get('priority') or 'NORMAL'
        TYPE_MAP = {'URGENT': 'urgent', 'HIGH': 'exam', 'LOW': 'holiday', 'NORMAL': 'general'}
        n = Notice.objects.create(
            title=body.get('title', ''),
            content=body.get('content', ''),
            notice_type=TYPE_MAP.get(prio, 'general'),
            audience=body.get('target_audience') or 'all',
            posted_by=poster,
        )
        return [serialize_notice(n)]

    if request.method == 'PATCH':
        qs = Notice.objects.all()
        nid_filter = params.get('notice_id', '')
        if nid_filter.startswith('eq.'):
            qs = qs.filter(pk=nid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for n in qs:
            if 'title' in body:
                n.title = body['title']
            if 'content' in body:
                n.content = body['content']
            if 'target_audience' in body:
                n.audience = body['target_audience']
            if 'priority' in body:
                TYPE_MAP = {'URGENT': 'urgent', 'HIGH': 'exam', 'LOW': 'holiday', 'NORMAL': 'general'}
                n.notice_type = TYPE_MAP.get(body['priority'], 'general')
            n.save()
        return [serialize_notice(n) for n in qs]

    if request.method == 'DELETE':
        qs = Notice.objects.all()
        nid_filter = params.get('notice_id', '')
        if nid_filter.startswith('eq.'):
            qs = qs.filter(pk=nid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
        return []


@handler('grievances')
@handler('complaints')
def handle_grievances(request, params, body):
    FM = {'grievance_id': 'pk', 'student_id': 'student__pk', 'status': 'status'}
    if request.method == 'GET':
        qs = Complaint.objects.select_related('student__user').all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'submitted_at.desc'), FM)
        return [serialize_grievance(c) for c in qs[:200]]

    if request.method == 'POST':
        sid = body.get('student_id')
        stu = Student.objects.filter(pk=sid).first()
        if not stu:
            return []
        c = Complaint.objects.create(
            student=stu,
            title=body.get('title') or body.get('description', '')[:100],
            description=body.get('description') or '',
            category=body.get('category') or 'other',
            is_anonymous=body.get('is_anonymous') or False,
            status='pending',
        )
        return [serialize_grievance(c)]

    if request.method == 'PATCH':
        qs = Complaint.objects.all()
        gid_filter = params.get('grievance_id', '')
        if gid_filter.startswith('eq.'):
            qs = qs.filter(pk=gid_filter[3:])
        for c in qs:
            if 'status' in body:
                status_map = {'OPEN': 'pending', 'IN_REVIEW': 'in_review',
                              'RESOLVED': 'resolved', 'DISMISSED': 'dismissed'}
                c.status = status_map.get(body['status'], body['status'])
            if 'resolution' in body or 'hod_response' in body:
                c.hod_response = body.get('resolution') or body.get('hod_response') or ''
            c.save()
        return [serialize_grievance(c) for c in qs]

    return []


@handler('attendance/stats')
def handle_attendance_stats(request, params, body):
    student = params.get('student') or params.get('student_id')
    course = params.get('course') or params.get('course_id')
    qs = AttendanceRecord.objects.all()
    if student:
        qs = qs.filter(Q(student__pk=int(student) if student.isdigit() else -1) | Q(student__student_id=student))
    elif hasattr(request, 'user') and request.user.is_authenticated and hasattr(request.user, 'student_profile'):
        qs = qs.filter(student=request.user.student_profile)
    if course:
        qs = qs.filter(Q(course__pk=int(course) if course.isdigit() else -1) | Q(course__code=course))
    total = qs.count()
    present = qs.filter(status='present').count()
    absent = qs.filter(status='absent').count()
    late = qs.filter(status='late').count()
    excused = qs.filter(status='excused').count()
    attended = present + late
    total_eligible = total if total > 0 else 1
    pct = round((attended / total_eligible) * 100, 1)
    return {'total': total, 'present': present, 'absent': absent, 'late': late, 'excused': excused, 'percentage': pct}


@handler('grades/my_grades')
def handle_my_grades(request, params, body):
    student = params.get('student')
    qs = Grade.objects.select_related('student__user', 'course').all()
    if student:
        qs = qs.filter(Q(student__pk=int(student) if student.isdigit() else -1) | Q(student__student_id=student))
    elif hasattr(request, 'user') and request.user.is_authenticated and hasattr(request.user, 'student_profile'):
        qs = qs.filter(student=request.user.student_profile)
    return [serialize_mark(g) for g in qs[:100]]


@handler('admin/stats')
@handler('auth/dashboard/stats')
def handle_admin_stats(request, params, body):
    total_fees_collected = sum(float(f.amount) for f in Fee.objects.filter(status='paid'))
    total_fees_pending = sum(float(f.amount) for f in Fee.objects.filter(status__in=['pending', 'overdue']))
    paid_student_ids = set(Fee.objects.filter(status='paid').values_list('student_id', flat=True))
    all_student_count = Student.objects.count()
    fees_pending_students = Student.objects.exclude(id__in=paid_student_ids).count()

    return {
        'total_students': all_student_count,
        'total_faculty': Faculty.objects.count(),
        'total_courses': Course.objects.count(),
        'total_departments': Department.objects.count(),
        'total_fees_collected': total_fees_collected,
        'total_fees_pending': total_fees_pending,
        'fees_pending_students': fees_pending_students,
        'active_users': User.objects.filter(is_active=True).count(),
        'inactive_users': User.objects.filter(is_active=False).count(),
        'total_hod': User.objects.filter(role='admin').count(),
        'total_users': User.objects.count(),
    }


@handler('students/my_profile')
def handle_student_profile(request, params, body):
    user_id = params.get('user_id')
    if user_id:
        st = Student.objects.filter(Q(user__pk=user_id if user_id.isdigit() else -1) | Q(user__username=user_id)).first()
        if st:
            return serialize_student(st)
    st = Student.objects.first()
    return serialize_student(st) if st else {}


@handler('faculty/my_profile')
def handle_faculty_profile(request, params, body):
    fac = Faculty.objects.first()
    return serialize_faculty(fac) if fac else {}


@handler('hod/check')
def handle_hod_check(request, params, body):
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
    fac = e.course.faculty
    return {
        'id': str(e.pk),
        'exam_id': str(e.pk),
        'course_id': str(e.course.pk),
        'course_code': e.course.code,
        'course_name': e.course.name,
        'department_name': e.course.department.name if e.course.department else '—',
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


@handler('exams')
def handle_exams(request, params, body):
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
    sid = params.get('student_id', '')
    student = None
    if sid.startswith('eq.'):
        val = sid[3:]
        if val.isdigit():
            student = Student.objects.filter(pk=val).first() or Student.objects.filter(user__pk=val).first()
        if not student:
            student = Student.objects.filter(student_id=val).first()
    if not student and hasattr(request, 'user') and request.user.is_authenticated:
        student = getattr(request.user, 'student_profile', None)
    if not student:
        return []
    return [compute_placement(student)]


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
    FM = {'id': 'pk', 'book_id': 'pk', 'category': 'category',
          'department_id': 'department__pk', 'isbn': 'isbn', 'barcode': 'barcode'}
    if request.method == 'GET':
        qs = Book.objects.select_related('department').all()
        # Free-text search across title/author/isbn/barcode (barcode/ISBN lookup).
        q = params.get('q', '').replace('eq.', '').replace('ilike.', '').strip('%').strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(author__icontains=q) |
                           Q(isbn__icontains=q) | Q(barcode__icontains=q) |
                           Q(category__icontains=q))
        if params.get('available', '') == 'eq.true':
            qs = qs.filter(available_copies__gt=0)
        qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'title.asc'), FM)
        return [serialize_book(b) for b in qs[:500]]

    if request.method == 'POST':
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        total = int(body.get('total_copies') or 1)
        b = Book.objects.create(
            isbn=body.get('isbn', ''),
            barcode=body.get('barcode', '') or f"LIB{timezone.now().strftime('%y%m%d%H%M%S')}",
            title=body.get('title', 'Untitled'),
            author=body.get('author', ''),
            publisher=body.get('publisher', ''),
            edition=body.get('edition', ''),
            category=body.get('category', ''),
            department=dept,
            shelf=body.get('shelf', ''),
            total_copies=total,
            available_copies=total,
            cover_url=body.get('cover_url', ''),
        )
        return [serialize_book(b)]

    if request.method == 'PATCH':
        bid = params.get('book_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        b = Book.objects.select_related('department').filter(pk=bid).first()
        if not b:
            return []
        if 'department_id' in body:
            b.department = Department.objects.filter(pk=body['department_id']).first()
        for f in ['isbn', 'barcode', 'title', 'author', 'publisher', 'edition', 'category', 'shelf', 'cover_url']:
            if f in body:
                setattr(b, f, body[f])
        # Adjust available copies in step with any change to the total stock.
        if 'total_copies' in body:
            new_total = int(body['total_copies'])
            delta = new_total - b.total_copies
            b.total_copies = new_total
            b.available_copies = max(0, min(new_total, b.available_copies + delta))
        b.save()
        return [serialize_book(b)]

    if request.method == 'DELETE':
        bid = params.get('book_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        Book.objects.filter(pk=bid).delete()
        return []

    return []


@handler('library/loans')
def handle_library_loans(request, params, body):
    FM = {'id': 'pk', 'loan_id': 'pk', 'status': 'status',
          'book_id': 'book__pk', 'student_id': 'student__pk'}
    if request.method == 'GET':
        qs = BookLoan.objects.select_related('book', 'student__user').all()
        sid = params.get('student_id', '')
        if sid.startswith('eq.'):
            val = sid[3:]
            qs = qs.filter(Q(student__pk=int(val) if val.isdigit() else -1) |
                           Q(student__user__pk=int(val) if val.isdigit() else -1) |
                           Q(student__student_id=val))
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        qs = apply_order(qs, params.get('order', 'issued_at.desc'), FM)
        return [serialize_loan(l) for l in qs[:400]]

    if request.method == 'POST':
        # Issue a book to a student.
        book = Book.objects.filter(pk=body.get('book_id')).first()
        stu = Student.objects.filter(pk=body.get('student_id')).first()
        if not stu and str(body.get('student_id') or '').isdigit():
            stu = Student.objects.filter(user__pk=body.get('student_id')).first()
        if not book or not stu:
            return {'error': 'book or student not found'}
        if book.available_copies < 1:
            return {'error': 'no copies available'}
        loan_days = int(body.get('loan_days') or 14)
        due = body.get('due_date') or (timezone.localdate() + timedelta(days=loan_days)).isoformat()
        loan = BookLoan.objects.create(book=book, student=stu, due_date=due)
        book.available_copies = max(0, book.available_copies - 1)
        book.save(update_fields=['available_copies'])
        return [serialize_loan(loan)]

    if request.method == 'PATCH':
        lid = params.get('loan_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        loan = BookLoan.objects.select_related('book', 'student__user').filter(pk=lid).first()
        if not loan:
            return []
        action = body.get('action')
        if action == 'return' and loan.status == 'issued':
            loan.returned_at = timezone.localdate()
            loan.fine = loan.computed_fine()
            loan.status = 'returned'
            loan.book.available_copies = min(loan.book.total_copies, loan.book.available_copies + 1)
            loan.book.save(update_fields=['available_copies'])
        elif action == 'lost':
            loan.status = 'lost'
        if body.get('fine_paid') is not None:
            loan.fine_paid = bool(body['fine_paid'])
        loan.save()
        return [serialize_loan(loan)]

    if request.method == 'DELETE':
        lid = params.get('loan_id', '').replace('eq.', '') or params.get('id', '').replace('eq.', '')
        loan = BookLoan.objects.select_related('book').filter(pk=lid).first()
        if loan:
            if loan.status == 'issued':  # return the copy to stock
                loan.book.available_copies = min(loan.book.total_copies, loan.book.available_copies + 1)
                loan.book.save(update_fields=['available_copies'])
            loan.delete()
        return []

    return []


@handler('library/stats')
def handle_library_stats(request, params, body):
    total_titles = Book.objects.count()
    total_copies = Book.objects.aggregate(s=Sum('total_copies'))['s'] or 0
    available = Book.objects.aggregate(s=Sum('available_copies'))['s'] or 0
    active_loans = BookLoan.objects.filter(status='issued')
    today = timezone.localdate()
    overdue = active_loans.filter(due_date__lt=today).count()
    outstanding_fine = sum(l.computed_fine() for l in active_loans.select_related('book')) + \
        float(BookLoan.objects.filter(status='returned', fine_paid=False)
              .aggregate(s=Sum('fine'))['s'] or 0)
    return {
        'total_titles': total_titles,
        'total_copies': int(total_copies),
        'available_copies': int(available),
        'issued_copies': int(total_copies) - int(available),
        'active_loans': active_loans.count(),
        'overdue': overdue,
        'outstanding_fine': float(outstanding_fine),
    }


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


# ── Main view ────────────────────────────────────────────────────────────────

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
