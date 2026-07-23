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
import json
import re
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
from fees.models import Fee
from timetable.models import Schedule
from notices.models import Notice
from complaints.models import Complaint

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
    internal = float(g.marks_obtained) * 0.4
    external = float(g.marks_obtained) * 0.6
    pct = g.percentage
    return {
        'mark_id': str(g.pk),
        'id': str(g.pk),
        'student_id': str(g.student.pk),
        'subject_id': str(g.course.pk),
        'internal_marks': round(internal, 2),
        'external_marks': round(external, 2),
        'total_marks': float(g.marks_obtained),
        'grade': g.grade,
        'percentage': pct,
        'exam_type': g.exam_type,
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
        updates = {}
        if 'is_active' in body:
            updates['is_active'] = body['is_active']
        if 'roles' in body:
            updates['role'] = body['roles']
        if 'email' in body:
            updates['email'] = body['email']
        if updates:
            qs.update(**updates)
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
        user = User.objects.get(pk=body.get('user_id'))
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        f = Faculty.objects.create(
            user=user,
            faculty_id=body.get('employee_id') or f'F{Faculty.objects.count()+1:03d}',
            department=dept,
            first_name=body.get('first_name') or user.first_name,
            last_name=body.get('last_name') or user.last_name,
        )
        return [serialize_faculty(f)]

    if request.method == 'PATCH':
        qs = Faculty.objects.select_related('user', 'department').all()
        qs = apply_postgrest_filters(qs, params, FM)
        update_fields = {}
        if 'first_name' in body:
            update_fields['user__first_name'] = body['first_name']
        if 'department_id' in body:
            update_fields['department_id'] = body['department_id']
        for fac in qs:
            if 'first_name' in body:
                fac.user.first_name = body['first_name']
                fac.user.save()
            if 'last_name' in body:
                fac.user.last_name = body['last_name']
                fac.user.save()
            if 'department_id' in body:
                fac.department_id = body['department_id']
                fac.save()
        return [serialize_faculty(f) for f in qs]

    if request.method == 'DELETE':
        qs = Faculty.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
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
        user_id = body.get('user_id')
        dept_id = body.get('department_id')
        fac = Faculty.objects.filter(user__pk=user_id).first()
        if fac:
            fac.designation = 'hod'
            if dept_id:
                fac.department_id = dept_id
            fac.save()
            return [{'hod_id': str(fac.pk), 'user_id': str(fac.user.pk),
                     'department_id': str(fac.department.pk) if fac.department else None}]
        return []

    if request.method == 'DELETE':
        hod_id_filter = params.get('hod_id', '')
        if hod_id_filter.startswith('eq.'):
            pk = hod_id_filter[3:]
            Faculty.objects.filter(pk=pk).update(designation='assistant_professor')
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
        user = User.objects.get(pk=body.get('user_id'))
        dept = Department.objects.filter(pk=body.get('department_id')).first()
        s = Student.objects.create(
            user=user,
            student_id=body.get('enrollment_no') or f'ENR{Student.objects.count()+1:06d}',
            department=dept,
            roll_number=str(body.get('current_rollno') or ''),
            gender=body.get('gender') or 'M',
            year_of_study=int(body.get('year_of_study') or 1),
            semester=int(body.get('semester') or 1),
            status=body.get('status') or 'active',
        )
        return [serialize_student(s)]

    if request.method == 'PATCH':
        qs = Student.objects.select_related('user', 'department').all()
        # Handle custom filter on pk
        sid_filter = params.get('student_id', '')
        if sid_filter.startswith('eq.'):
            qs = qs.filter(pk=sid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for s in qs:
            if 'enrollment_no' in body:
                s.student_id = body['enrollment_no']
            if 'status' in body:
                s.status = body['status']
            if 'current_rollno' in body:
                s.roll_number = str(body['current_rollno'])
            if 'department_id' in body:
                s.department_id = body['department_id']
            s.save()
        return [serialize_student(s) for s in qs]

    if request.method == 'DELETE':
        qs = Student.objects.all()
        qs = apply_postgrest_filters(qs, params, FM)
        qs.delete()
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
        total = float(body.get('total_marks') or 0)
        g, _ = Grade.objects.get_or_create(
            student=stu, course=course, exam_type=body.get('exam_type') or 'Semester End Exam',
            defaults={'marks_obtained': total, 'total_marks': 100}
        )
        return [serialize_mark(g)]

    if request.method == 'PATCH':
        qs = Grade.objects.all()
        mid_filter = params.get('mark_id', '')
        if mid_filter.startswith('eq.'):
            qs = qs.filter(pk=mid_filter[3:])
        else:
            qs = apply_postgrest_filters(qs, params, FM)
        for g in qs:
            if 'total_marks' in body:
                g.marks_obtained = float(body['total_marks'])
            g.save()
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


MOCK_CONTENT_STORE = [
    {
        'id': 'cnt-1',
        'content_id': 'cnt-1',
        'title': 'Data Structures Lecture Notes & Array Operations',
        'description': 'Comprehensive notes on Linear Data Structures, Stacks, Queues, and Array Operations with code snippets.',
        'content_type': 'notes',
        'subject_id': '27',
        'subject_name': 'Computer Organization',
        'subject_code': 'ME114',
        'faculty_name': 'Kush Panchal',
        'file_url': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        'video_url': '',
        'topic_tag': 'Data Structures & Algorithms',
        'is_active': True,
        'uploaded_at': '2026-07-20T10:00:00Z',
        'created_at': '2026-07-20T10:00:00Z',
    },
    {
        'id': 'cnt-2',
        'content_id': 'cnt-2',
        'title': 'Fluid Mechanics & Thermal Systems Video Tutorial',
        'description': 'Video tutorial on Fluid Dynamics, Bernoulli Equation, and Laminar Flow Applications.',
        'content_type': 'video',
        'subject_id': '28',
        'subject_name': 'Fluid Mechanics',
        'subject_code': 'ME115',
        'faculty_name': 'Kinjal Shah',
        'file_url': '',
        'video_url': 'https://www.youtube.com/watch?v=dl00fOOYLOM',
        'topic_tag': 'Fluid Mechanics & Flow',
        'is_active': True,
        'uploaded_at': '2026-07-21T14:30:00Z',
        'created_at': '2026-07-21T14:30:00Z',
    },
    {
        'id': 'cnt-3',
        'content_id': 'cnt-3',
        'title': 'Thermodynamics Heat Transfer Assignment 3',
        'description': 'Assignment 3: Calculate conduction and convection heat loss in cylindrical pipes.',
        'content_type': 'assignment',
        'subject_id': '29',
        'subject_name': 'Thermodynamics',
        'subject_code': 'ME116',
        'faculty_name': 'Devang Patel',
        'file_url': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        'video_url': '',
        'topic_tag': 'Thermodynamics & Heat',
        'is_active': True,
        'uploaded_at': '2026-07-22T09:15:00Z',
        'created_at': '2026-07-22T09:15:00Z',
    },
    {
        'id': 'cnt-4',
        'content_id': 'cnt-4',
        'title': 'Engineering Metallurgy & Material Science Reference Guide',
        'description': 'Reference manual covering Crystal Structures, Phase Diagrams, and Heat Treatment processes.',
        'content_type': 'reference',
        'subject_id': '27',
        'subject_name': 'Computer Organization',
        'subject_code': 'ME114',
        'faculty_name': 'Kush Panchal',
        'file_url': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        'video_url': '',
        'topic_tag': 'Material Science',
        'is_active': True,
        'uploaded_at': '2026-07-23T11:00:00Z',
        'created_at': '2026-07-23T11:00:00Z',
    },
]

MOCK_DOUBTS_STORE = [
    {
        'id': 'dbt-1',
        'doubt_id': 'dbt-1',
        'question': 'How does time complexity differ between QuickSort worst-case O(n^2) and MergeSort O(n log n)?',
        'student_id': '39',
        'student_name': 'Meera Patel',
        'subject_id': '27',
        'subject_name': 'Computer Organization',
        'assigned_faculty_name': 'Kush Panchal',
        'status': 'resolved',
        'resolution': 'QuickSort selects a pivot; if the pivot is smallest/largest item every split, recursion depth is n leading to O(n^2). MergeSort always divides the array exactly in half.',
        'submitted_at': '2026-07-22T10:00:00Z',
        'resolved_at': '2026-07-22T15:30:00Z',
        'sla_deadline': '2026-07-23T10:00:00Z',
    },
    {
        'id': 'dbt-2',
        'doubt_id': 'dbt-2',
        'question': 'What is the difference between laminar and turbulent flow boundary layers in Fluid Mechanics?',
        'student_id': '39',
        'student_name': 'Meera Patel',
        'subject_id': '28',
        'subject_name': 'Fluid Mechanics',
        'assigned_faculty_name': 'Kinjal Shah',
        'status': 'open',
        'resolution': '',
        'submitted_at': '2026-07-23T09:00:00Z',
        'resolved_at': None,
        'sla_deadline': '2026-07-24T18:00:00Z',
    },
    {
        'id': 'dbt-3',
        'doubt_id': 'dbt-3',
        'question': 'Can you clarify how Carnot Cycle efficiency relates to the Second Law of Thermodynamics?',
        'student_id': '39',
        'student_name': 'Meera Patel',
        'subject_id': '29',
        'subject_name': 'Thermodynamics',
        'assigned_faculty_name': 'Devang Patel',
        'status': 'under_review',
        'resolution': '',
        'submitted_at': '2026-07-23T16:00:00Z',
        'resolved_at': None,
        'sla_deadline': '2026-07-25T12:00:00Z',
    },
]


@handler('content')
@handler('study_materials')
def handle_content(request, params, body):
    if request.method == 'GET':
        subj_filter = params.get('subject_id')
        items = MOCK_CONTENT_STORE
        if subj_filter:
            val = subj_filter.replace('eq.', '').strip()
            items = [c for c in items if str(c.get('subject_id')) == val]
        return items

    if request.method == 'POST':
        new_item = {
            'id': f'cnt-{len(MOCK_CONTENT_STORE)+1}',
            'content_id': f'cnt-{len(MOCK_CONTENT_STORE)+1}',
            'title': body.get('title', 'Study Material'),
            'description': body.get('description', ''),
            'content_type': body.get('content_type', 'notes'),
            'subject_id': str(body.get('subject_id', '27')),
            'subject_name': body.get('subject_name', 'Course Material'),
            'subject_code': body.get('subject_code', 'GEN100'),
            'faculty_name': 'Faculty Instructor',
            'file_url': body.get('file_url', '#'),
            'video_url': body.get('video_url', ''),
            'topic_tag': body.get('topic_tag', 'General'),
            'is_active': True,
            'uploaded_at': _dt(date.today()),
            'created_at': _dt(date.today()),
        }
        MOCK_CONTENT_STORE.insert(0, new_item)
        return [new_item]

    return []


@handler('doubts')
def handle_doubts(request, params, body):
    if request.method == 'GET':
        stud_filter = params.get('student_id')
        items = MOCK_DOUBTS_STORE
        if stud_filter:
            val = stud_filter.replace('eq.', '').strip()
            items = [d for d in items if str(d.get('student_id')) == val or str(d.get('student_name', '')).lower() == val.lower()]
        return items

    if request.method == 'POST':
        new_doubt = {
            'id': f'dbt-{len(MOCK_DOUBTS_STORE)+1}',
            'doubt_id': f'dbt-{len(MOCK_DOUBTS_STORE)+1}',
            'question': body.get('question') or body.get('questionText') or 'New Question',
            'student_id': str(body.get('student_id') or body.get('student') or '39'),
            'student_name': 'Meera Patel',
            'subject_id': str(body.get('subject_id') or body.get('course') or '27'),
            'subject_name': body.get('subject_name', 'Subject'),
            'assigned_faculty_name': 'Subject Professor',
            'status': 'open',
            'resolution': '',
            'submitted_at': _dt(date.today()),
            'resolved_at': None,
            'sla_deadline': '2026-07-26T12:00:00Z',
        }
        MOCK_DOUBTS_STORE.insert(0, new_doubt)
        return [new_doubt]

    if request.method == 'PATCH':
        did = params.get('doubt_id', '').replace('eq.', '')
        for d in MOCK_DOUBTS_STORE:
            if d['id'] == did or d['doubt_id'] == did:
                if 'status' in body:
                    d['status'] = body['status']
                if 'resolution' in body:
                    d['resolution'] = body['resolution']
                if 'resolved_at' in body:
                    d['resolved_at'] = body['resolved_at']
                return [d]
        return []

    return []


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
