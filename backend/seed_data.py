"""
Seed script — imports data from backend-node/db-export/*.json into Django SQLite.
Run with:  python seed_data.py
"""
import os
import sys
import json
import django
from pathlib import Path
from datetime import date, timedelta

# Windows consoles default to cp1252, which can't encode the emoji used in the
# progress output below. Force UTF-8 so `python seed_data.py` runs everywhere.
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    pass

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / 'db-export'
if not EXPORT_DIR.exists():
    EXPORT_DIR = BASE_DIR.parent / 'backend-node' / 'db-export'

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'college_management.settings')
django.setup()

from django.db import transaction
from django.utils import timezone
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
from campus.models import StudyMaterial, Doubt, Alumnus, FacultyFeedback, Parent, Backlog, Exam
from placement.models import PlacementCompany


def load(filename):
    path = EXPORT_DIR / filename
    if not path.exists():
        print(f"  ⚠️  {filename} not found, skipping.")
        return []
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def safe_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


print("🌱 Seeding Django database from MongoDB exports...")
print("=" * 60)

with transaction.atomic():
    # ── Clear existing data ───────────────────────────────────────
    print("\n⏳ Clearing existing data...")
    StudyMaterial.objects.all().delete()
    Doubt.objects.all().delete()
    Alumnus.objects.all().delete()
    FacultyFeedback.objects.all().delete()
    Parent.objects.all().delete()
    Backlog.objects.all().delete()
    Exam.objects.all().delete()
    PlacementCompany.objects.all().delete()
    AttendanceRecord.objects.all().delete()
    Grade.objects.all().delete()
    Fee.objects.all().delete()
    Schedule.objects.all().delete()
    Complaint.objects.all().delete()
    Enrollment.objects.all().delete()
    Notice.objects.all().delete()
    Course.objects.all().delete()
    Student.objects.all().delete()
    Faculty.objects.all().delete()
    Department.objects.all().delete()
    User.objects.all().delete()

    # ── 1. DEPARTMENTS ────────────────────────────────────────────
    print("\n📂 Importing departments...")
    dept_rows = load('departments.json')
    dept_map = {}  # mongo_dept_id → Django Department
    for d in dept_rows:
        dept = Department.objects.create(
            name=d.get('name', 'Unknown'),
            code=d.get('code', d.get('name', 'UNK')[:10]),
            description=d.get('description', ''),
        )
        dept_map[d.get('department_id') or d.get('id')] = dept
    print(f"  ✅ {len(dept_map)} departments")

    # Fallback default dept
    default_dept = list(dept_map.values())[0] if dept_map else Department.objects.create(name='General', code='GEN')

    # ── 2. USERS ──────────────────────────────────────────────────
    print("\n👤 Importing users...")
    user_rows = load('users.json')
    user_map = {}  # mongo_user_id → Django User

    ROLE_MAP = {
        'admin': 'admin',
        'faculty': 'faculty',
        'hod': 'faculty',
        'student': 'student',
    }

    for u in user_rows:
        uid = u.get('id')
        email = u.get('email', f"user_{uid}@lju.edu.in")
        password_raw = u.get('password_hash', 'student123')
        raw_role = (u.get('roles') or u.get('role') or 'student').lower()
        role = ROLE_MAP.get(raw_role, 'student')

        prefix = email.split('@')[0]
        parts = prefix.replace('.', ' ').replace('_', ' ').split()
        first = parts[0].capitalize() if parts else 'User'
        last = ' '.join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else ''

        django_user = User(
            username=prefix[:150],
            email=email,
            first_name=first,
            last_name=last,
            role=role,
            is_active=u.get('is_active', True),
        )
        # Store plain password so users can log in
        django_user.set_password(password_raw)
        django_user.save()
        user_map[uid] = django_user

    # Create a guaranteed admin superuser
    if not User.objects.filter(email='admin@lju.edu.in').exists():
        admin_user = User.objects.create_superuser(
            username='admin_lju',
            email='admin@lju.edu.in',
            password='admin123',
            first_name='Admin',
            last_name='LJU',
            role='admin',
        )
    else:
        admin_user = User.objects.get(email='admin@lju.edu.in')
        admin_user.set_password('admin123')
        admin_user.is_superuser = True
        admin_user.is_staff = True
        admin_user.save()

    # Ensure HOD user
    hod_user_row = next((u for u in user_rows if 'hod' in (u.get('email',''))), None)

    print(f"  ✅ {len(user_map)} users")

    # ── 3. FACULTY ────────────────────────────────────────────────
    print("\n👨‍🏫 Importing faculty...")
    faculty_rows = load('faculty.json')
    hod_rows = load('hod.json')
    hod_user_ids = {h.get('user_id') for h in hod_rows}

    faculty_map = {}  # mongo_faculty_id → Django Faculty
    for f in faculty_rows:
        uid = f.get('user_id')
        django_user = user_map.get(uid)
        if not django_user:
            continue
        dept_id = f.get('department_id')
        dept = dept_map.get(dept_id, default_dept)

        # Update user name from faculty record
        if f.get('first_name'):
            django_user.first_name = f['first_name']
        if f.get('last_name'):
            django_user.last_name = f['last_name']
        django_user.save()

        desig = 'hod' if uid in hod_user_ids else 'assistant_professor'
        fac = Faculty.objects.create(
            user=django_user,
            faculty_id=f.get('employee_id') or f.get('faculty_id') or f.get('id') or f'F{Faculty.objects.count()+1:03d}',
            department=dept,
            designation=desig,
            qualification=f.get('qualification', ''),
            experience_years=int(f.get('experience_years') or 0),
            joining_date=safe_date(f.get('joining_date')) or date(2020, 6, 1),
            salary=float(f.get('salary') or 60000),
            is_active=True,
        )
        faculty_map[f.get('faculty_id') or f.get('id')] = fac

    print(f"  ✅ {len(faculty_map)} faculty")

    # ── 4. STUDENTS ───────────────────────────────────────────────
    print("\n🎓 Importing students...")
    student_rows = load('students.json')
    semester_rows = load('semesters.json')

    # Map semester UUID → semester number
    sem_num_map = {}
    for sem in semester_rows:
        sem_id = sem.get('semester_id') or sem.get('id')
        sem_num_map[sem_id] = int(sem.get('number') or sem.get('semester_number') or 1)

    student_map = {}  # mongo_student_id → Django Student
    for s in student_rows:
        uid = s.get('user_id')
        django_user = user_map.get(uid)
        if not django_user:
            continue
        dept_id = s.get('department_id')
        dept = dept_map.get(dept_id, default_dept)

        sem_id = s.get('current_semester_id')
        sem_num = sem_num_map.get(sem_id, 1)
        year_of_study = max(1, (sem_num + 1) // 2)

        # Update user name from student record
        if s.get('first_name'):
            django_user.first_name = s['first_name']
        if s.get('last_name'):
            django_user.last_name = s['last_name']
        django_user.save()

        stu = Student.objects.create(
            user=django_user,
            student_id=s.get('enrollment_no') or s.get('student_id') or f'ENR{Student.objects.count()+1:06d}',
            department=dept,
            roll_number=str(s.get('current_rollno') or ''),
            gender='M',
            year_of_study=year_of_study,
            semester=sem_num,
            admission_date=safe_date(s.get('admission_date')) or date(2022, 7, 15),
            guardian_name=s.get('parent_name') or '',
            guardian_phone=s.get('parent_phone') or '',
            status='active',
        )
        student_map[s.get('student_id') or s.get('id')] = stu

    print(f"  ✅ {len(student_map)} students")

    # ── 5. COURSES (Subjects) ─────────────────────────────────────
    print("\n📚 Importing courses...")
    subject_rows = load('subjects.json')

    course_map = {}  # mongo_subject_id → Django Course
    for sub in subject_rows:
        dept_id = sub.get('department_id')
        dept = dept_map.get(dept_id, default_dept)
        fac_id = sub.get('faculty_id')
        fac = faculty_map.get(fac_id)

        sem_id = sub.get('semester_id')
        sem_num = sem_num_map.get(sem_id, 1)

        c = Course.objects.create(
            name=sub.get('name', 'Unknown Subject'),
            code=sub.get('code', f"SUB{Course.objects.count()+1:03d}"),
            department=dept,
            faculty=fac,
            credits=int(sub.get('credits') or 3),
            semester=sem_num,
            description=sub.get('description') or '',
            max_students=int(sub.get('max_students') or 60),
            is_active=True,
        )
        course_map[sub.get('subject_id') or sub.get('id')] = c

    print(f"  ✅ {len(course_map)} courses")

    # ── 6. ENROLLMENTS ────────────────────────────────────────────
    print("\n📋 Importing enrollments...")
    enrollment_rows = load('enrollments.json')
    enroll_count = 0
    for e in enrollment_rows:
        sid = e.get('student_id')
        cid = e.get('subject_id')
        stu = student_map.get(sid)
        course = course_map.get(cid)
        if not stu or not course:
            continue
        Enrollment.objects.get_or_create(student=stu, course=course)
        enroll_count += 1
    print(f"  ✅ {enroll_count} enrollments")

    # ── 7. ATTENDANCE ─────────────────────────────────────────────
    print("\n✅ Importing attendance records...")
    att_rows = load('attendance_records.json')
    att_count = 0
    STATUS_MAP = {
        'P': 'present', 'PRESENT': 'present', 'present': 'present',
        'A': 'absent', 'ABSENT': 'absent', 'absent': 'absent',
        'L': 'late', 'LATE': 'late', 'late': 'late',
        'E': 'excused', 'EXCUSED': 'excused', 'excused': 'excused',
    }
    for a in att_rows:
        sid = a.get('student_id')
        cid = a.get('subject_id')
        stu = student_map.get(sid)
        course = course_map.get(cid)
        att_date = safe_date(a.get('date') or a.get('marked_at'))
        if not stu or not course or not att_date:
            continue
        raw_status = str(a.get('status') or 'present').upper()
        status = STATUS_MAP.get(raw_status, 'present')
        AttendanceRecord.objects.get_or_create(
            student=stu, course=course, date=att_date,
            defaults={'status': status, 'marked_by': admin_user},
        )
        att_count += 1
    print(f"  ✅ {att_count} attendance records")

    # ── 8. GRADES (Marks) ─────────────────────────────────────────
    print("\n📊 Importing grades/marks...")
    marks_rows = load('marks.json')
    grade_count = 0
    for m in marks_rows:
        sid = m.get('student_id')
        cid = m.get('subject_id')
        stu = student_map.get(sid)
        course = course_map.get(cid)
        if not stu or not course:
            continue
        internal = float(m.get('internal_marks') or 0)
        external = float(m.get('external_marks') or 0)
        total = float(m.get('total_marks') or (internal + external) or 0)

        Grade.objects.get_or_create(
            student=stu, course=course, exam_type='Semester End Exam',
            defaults={
                'marks_obtained': total,
                'total_marks': 100,
                'graded_by': admin_user,
                'exam_date': safe_date(m.get('entered_at')) or date(2024, 11, 15),
            }
        )
        grade_count += 1
    print(f"  ✅ {grade_count} grade records")

    # ── 9. FEES ───────────────────────────────────────────────────
    print("\n💰 Importing fees...")
    fee_payment_rows = load('fee_payments.json')
    fee_structure_rows = load('fee_structures.json')

    fee_struct_map = {
        (fs.get('fee_id') or fs.get('id')): fs for fs in fee_structure_rows
    }
    FEE_TYPE_MAP = {
        'tuition': 'tuition', 'Tuition Fee': 'tuition',
        'exam': 'exam', 'Exam Fee': 'exam',
        'library': 'library', 'Library Fee': 'library',
        'sports': 'sports', 'Sports Fee': 'sports',
        'hostel': 'hostel', 'Hostel Fee': 'hostel',
        'transport': 'transport', 'misc': 'misc',
    }
    fee_count = 0
    for fp in fee_payment_rows:
        sid = fp.get('student_id')
        stu = student_map.get(sid)
        if not stu:
            continue
        struct_id = fp.get('fee_structure_id')
        struct = fee_struct_map.get(struct_id, {})
        raw_type = struct.get('component_name') or fp.get('fee_type') or 'tuition'
        fee_type = FEE_TYPE_MAP.get(raw_type, 'misc')
        amount = float(struct.get('amount') or fp.get('amount') or fp.get('amount_paid') or 0)
        raw_status = (fp.get('status') or 'pending').lower()
        status = raw_status if raw_status in ('paid', 'pending', 'overdue', 'waived') else 'pending'

        Fee.objects.create(
            student=stu,
            fee_type=fee_type,
            amount=amount,
            due_date=safe_date(fp.get('due_date')) or date(2024, 12, 31),
            status=status,
            payment_date=safe_date(fp.get('payment_date')),
            transaction_id=fp.get('transaction_id') or '',
            academic_year=fp.get('academic_year') or '2024-25',
            semester=int(fp.get('semester') or 1),
        )
        fee_count += 1
    print(f"  ✅ {fee_count} fee records")

    # ── 10. TIMETABLE ─────────────────────────────────────────────
    print("\n🗓️  Importing timetable...")
    timetable_rows = load('timetable.json')
    DAY_MAP = {
        'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
        'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday',
        '1': 'monday', '2': 'tuesday', '3': 'wednesday',
        '4': 'thursday', '5': 'friday', '6': 'saturday',
    }
    tt_count = 0
    for t in timetable_rows:
        cid = t.get('subject_id')
        fid = t.get('faculty_id')
        course = course_map.get(cid)
        fac = faculty_map.get(fid)
        if not course:
            continue
        raw_day = str(t.get('day_of_week') or '').lower()
        day = DAY_MAP.get(raw_day, 'monday')
        start = t.get('start_time', '09:00')
        end = t.get('end_time', '10:00')
        # Truncate to HH:MM if longer
        if start and len(str(start)) > 5:
            start = str(start)[:5]
        if end and len(str(end)) > 5:
            end = str(end)[:5]
        Schedule.objects.get_or_create(
            course=course, day=day, start_time=start,
            defaults={
                'faculty': fac or course.faculty,
                'end_time': end,
                'room': t.get('room_no') or t.get('room') or 'TBA',
            }
        )
        tt_count += 1
    print(f"  ✅ {tt_count} timetable entries")

    # ── 11. NOTICES ───────────────────────────────────────────────
    print("\n📢 Importing notices...")
    notice_rows = load('notices.json')
    NOTICE_TYPE_MAP = {
        'general': 'general', 'exam': 'exam', 'holiday': 'holiday',
        'event': 'event', 'urgent': 'urgent', 'URGENT': 'urgent',
        'NORMAL': 'general', 'INFO': 'general',
    }
    notice_count = 0
    for n in notice_rows:
        uid = n.get('author_id') or n.get('created_by')
        poster = user_map.get(uid, admin_user)
        raw_type = n.get('notice_type') or n.get('priority') or 'general'
        notice_type = NOTICE_TYPE_MAP.get(raw_type, 'general')
        Notice.objects.create(
            title=n.get('title', 'Notice'),
            content=n.get('content') or n.get('body') or '',
            notice_type=notice_type,
            audience=n.get('audience') or 'all',
            posted_by=poster,
            is_active=n.get('is_active', True),
        )
        notice_count += 1
    print(f"  ✅ {notice_count} notices")

    # ── 12. COMPLAINTS / GRIEVANCES ───────────────────────────────
    print("\n📣 Importing complaints/grievances...")
    grievance_rows = load('grievances.json')
    STATUS_COMPLAINT_MAP = {
        'OPEN': 'pending', 'open': 'pending', 'pending': 'pending',
        'IN_REVIEW': 'in_review', 'in_review': 'in_review', 'RESOLVED': 'resolved',
        'resolved': 'resolved', 'DISMISSED': 'dismissed',
    }
    comp_count = 0
    for g in grievance_rows:
        sid = g.get('student_id')
        stu = student_map.get(sid)
        if not stu:
            continue
        raw_status = str(g.get('status') or 'pending')
        status = STATUS_COMPLAINT_MAP.get(raw_status, 'pending')
        Complaint.objects.create(
            student=stu,
            title=g.get('title') or g.get('subject') or 'Grievance',
            description=g.get('description') or g.get('body') or '',
            category=g.get('category') or 'other',
            status=status,
            hod_response=g.get('resolution') or g.get('hod_response') or '',
            is_anonymous=g.get('is_anonymous', False),
        )
        comp_count += 1
    print(f"  ✅ {comp_count} complaints/grievances")

    # ── 13. STUDY MATERIALS (Content) ─────────────────────────────
    from datetime import datetime

    def safe_dt(s):
        if not s:
            return None
        try:
            return datetime.fromisoformat(str(s).replace('Z', '+00:00'))
        except Exception:
            return None

    print("\n📖 Importing study materials (content)...")
    content_rows = load('content.json')
    content_count = 0
    for c in content_rows:
        course = course_map.get(c.get('subject_id'))
        if not course:
            continue
        fac = faculty_map.get(c.get('faculty_id')) or course.faculty
        StudyMaterial.objects.create(
            course=course,
            faculty=fac,
            content_type=(c.get('content_type') or 'notes').lower(),
            title=c.get('title', 'Study Material'),
            description=c.get('description', ''),
            file_url=c.get('file_url') or '',
            video_url=c.get('video_url') or '',
            topic_tag=c.get('topic_tag') or '',
            is_active=c.get('is_active', True),
            uploaded_at=safe_dt(c.get('uploaded_at')) or timezone.now(),
        )
        content_count += 1
    print(f"  ✅ {content_count} study materials")

    # ── 14. DOUBTS ────────────────────────────────────────────────
    print("\n❓ Importing doubts...")
    doubt_rows = load('doubts.json')
    doubt_count = 0
    for d in doubt_rows:
        stu = student_map.get(d.get('student_id'))
        if not stu:
            continue
        course = course_map.get(d.get('subject_id'))
        assigned = faculty_map.get(d.get('assigned_faculty_id'))
        submitted = safe_dt(d.get('submitted_at')) or timezone.now()
        Doubt.objects.create(
            student=stu,
            course=course,
            question=d.get('question', ''),
            attachment_url=d.get('attachment_url') or '',
            status=(d.get('status') or 'open').lower(),
            assigned_faculty=assigned,
            resolution=d.get('resolution') or '',
            sla_deadline=submitted + timedelta(hours=72),
            submitted_at=submitted,
            resolved_at=safe_dt(d.get('resolved_at')),
        )
        doubt_count += 1
    print(f"  ✅ {doubt_count} doubts")

    # ── 15. ALUMNI (synthesized from senior students) ─────────────
    print("\n🎓 Building alumni directory...")
    COMPANIES = [
        ('Google', 'Software Engineer', 'Bangalore'),
        ('Microsoft', 'SDE II', 'Hyderabad'),
        ('Amazon', 'Cloud Engineer', 'Pune'),
        ('TCS', 'Systems Engineer', 'Ahmedabad'),
        ('Infosys', 'Technology Analyst', 'Mysore'),
        ('Deloitte', 'Consultant', 'Mumbai'),
        ('Reliance Jio', 'Network Engineer', 'Navi Mumbai'),
        ('Zoho', 'Product Engineer', 'Chennai'),
        ('Adani Group', 'Project Engineer', 'Ahmedabad'),
        ('Wipro', 'Project Engineer', 'Bangalore'),
    ]
    DEGREES = ['B.Tech', 'B.E.', 'M.Tech']
    alumni_count = 0
    senior_students = [s for s in student_map.values() if s.semester >= 7][:12]
    if len(senior_students) < 8:
        senior_students = list(student_map.values())[:12]
    for i, stu in enumerate(senior_students):
        company, role, loc = COMPANIES[i % len(COMPANIES)]
        grad_year = 2026 - (i % 4)  # spread across recent years
        Alumnus.objects.create(
            student=stu,
            department=stu.department,
            first_name=stu.user.first_name or 'Alumnus',
            last_name=stu.user.last_name or '',
            email=stu.user.email,
            graduation_year=grad_year,
            degree=DEGREES[i % len(DEGREES)],
            current_company=company,
            designation=role,
            location=loc,
            linkedin_url=f'https://linkedin.com/in/{(stu.user.first_name or "alum").lower()}-{stu.pk}',
            available_for_mentorship=(i % 3 == 0),
        )
        alumni_count += 1
    print(f"  ✅ {alumni_count} alumni")

    # ── 16. FACULTY FEEDBACK (sample survey responses) ────────────
    import random
    print("\n⭐ Seeding faculty feedback...")
    fb_count = 0
    all_students = list(student_map.values())
    COMMENTS = [
        'Very clear explanations and always approachable.',
        'Good subject knowledge, could pace lectures a bit slower.',
        'Punctual and well-prepared for every class.',
        'Engaging teaching style with helpful examples.',
        '', '', 'Encourages doubts and answers them patiently.',
    ]
    for course in course_map.values():
        fac = course.faculty
        if not fac:
            continue
        # 2–4 responses per course from random students
        for stu in random.sample(all_students, min(len(all_students), random.randint(2, 4))):
            FacultyFeedback.objects.create(
                student=stu, faculty=fac, course=course,
                teaching=random.randint(3, 5), knowledge=random.randint(3, 5),
                communication=random.randint(2, 5), punctuality=random.randint(3, 5),
                comment=random.choice(COMMENTS),
                is_anonymous=random.random() < 0.7,
            )
            fb_count += 1
    print(f"  ✅ {fb_count} feedback responses")

    # ── 17. PLACEMENT COMPANIES ───────────────────────────────────
    print("\n🏢 Importing placement companies...")
    company_rows = load('placement_companies.json')
    ENRICH = {
        'TCS': ('IT', 4.5, 'System Engineer, Ninja/Digital', 2),
        'Infosys': ('IT', 4.5, 'Systems Engineer', 0),
        'Wipro': ('IT', 4.0, 'Project Engineer', 1),
        'Accenture': ('Consulting', 6.5, 'Associate Software Engineer', 0),
        'Capgemini': ('IT', 4.2, 'Analyst', 0),
        'Cognizant': ('IT', 5.0, 'Programmer Analyst', 0),
        'HCL Technologies': ('IT', 4.5, 'Graduate Engineer Trainee', 1),
        'Tech Mahindra': ('IT', 4.0, 'Associate Engineer', 0),
        'IBM India': ('IT', 6.0, 'Associate Developer', 0),
        'Amazon': ('IT', 28.0, 'SDE-1', 0),
        'Microsoft': ('IT', 32.0, 'Software Engineer', 0),
        'Google': ('IT', 35.0, 'Software Engineer', 0),
        'Deloitte': ('Consulting', 7.5, 'Analyst', 0),
        'Goldman Sachs': ('Finance', 18.0, 'Analyst', 0),
        'JP Morgan': ('Finance', 16.0, 'Technology Analyst', 0),
    }
    comp_count = 0
    for c in company_rows:
        name = c.get('name', 'Company')
        sector, package, roles, bond = ENRICH.get(
            name, ('IT', round(4 + float(c.get('min_cpi') or 6) * 1.3, 1), 'Graduate Trainee', 0))
        PlacementCompany.objects.create(
            name=name, sector=sector, package_lpa=package,
            min_cpi=float(c.get('min_cpi') or 6.0),
            max_backlogs=int(c.get('max_backlogs') or 0),
            min_attendance=float(c.get('min_attendance') or 75.0),
            roles=roles, bond_years=bond,
            other_criteria=c.get('other_criteria') or '',
            is_active=c.get('is_active', True),
        )
        comp_count += 1
    print(f"  ✅ {comp_count} placement companies")

    # ── 18. PARENT ACCOUNTS (read-only portal) ────────────────────
    print("\n👪 Creating parent accounts...")
    parent_count = 0
    parent_students = list(student_map.values())[:10]
    for i, stu in enumerate(parent_students):
        guardian = stu.guardian_name or f'{stu.user.first_name} Parent'
        parts = guardian.split()
        first = parts[0] if parts else 'Parent'
        last = stu.user.last_name or (parts[-1] if len(parts) > 1 else '')
        email = f'parent{i+1}@lju.edu.in'
        puser = User(username=f'parent{i+1}', email=email, first_name=first,
                     last_name=last, role='parent', is_active=True, phone=stu.guardian_phone or '')
        puser.set_password('parent123')
        puser.save()
        Parent.objects.create(user=puser, student=stu,
                              relation='father' if i % 2 == 0 else 'mother',
                              phone=stu.guardian_phone or '')
        parent_count += 1
    print(f"  ✅ {parent_count} parent accounts (login: parent1@lju.edu.in / parent123)")

    # ── 19. BACKLOGS / KT (re-exam tracking) ──────────────────────
    print("\n📉 Seeding backlogs / KT records...")
    backlog_count = 0
    # Real failures first: every current 'F' grade is an active backlog.
    for g in Grade.objects.filter(grade='F').select_related('student', 'course'):
        Backlog.objects.get_or_create(
            student=g.student, course=g.course,
            defaults={'semester': g.course.semester, 'status': 'active'})
        backlog_count += 1

    # Add historical KT records with mixed statuses for a realistic module.
    backlog_students = list(student_map.values())[10:24]
    for i, stu in enumerate(backlog_students):
        courses = list(Course.objects.filter(enrollments__student=stu).distinct()[:3])
        for j, course in enumerate(random.sample(courses, min(len(courses), random.randint(1, 2)))):
            roll = (i + j) % 3
            status = ['active', 'registered', 'cleared'][roll]
            reexam = date(2026, 8, 10 + (i % 15)) if status in ('registered', 'cleared') else None
            cleared = date(2026, 8, 20 + (i % 8)) if status == 'cleared' else None
            _, created = Backlog.objects.get_or_create(
                student=stu, course=course,
                defaults={'semester': course.semester, 'status': status,
                          'attempts': 2 if status == 'cleared' else 1,
                          'reexam_date': reexam, 'cleared_date': cleared})
            if created:
                backlog_count += 1
    print(f"  ✅ {backlog_count} backlog records")

    # ── 20. EXAM SCHEDULE (end-semester timetable) ────────────────
    from datetime import time as _time
    print("\n🗓️  Scheduling examinations...")
    exam_count = 0
    SLOTS = [(_time(10, 0), _time(13, 0)), (_time(14, 0), _time(17, 0))]
    ROOMS = ['Exam Hall A', 'Exam Hall B', 'Block C-101', 'Block C-102', 'Auditorium']
    exam_courses = list(Course.objects.all()[:16])
    for i, course in enumerate(exam_courses):
        exam_date = date(2026, 8, 3) + timedelta(days=(i // 2) * 2)  # 2 exams/day, gap day
        start, end = SLOTS[i % 2]
        Exam.objects.create(
            course=course, exam_type='endsem', date=exam_date,
            start_time=start, end_time=end,
            room=ROOMS[i % len(ROOMS)], building='Main Campus',
            max_marks=100, seats_per_room=30,
        )
        exam_count += 1
    print(f"  ✅ {exam_count} exams scheduled")

print("\n" + "=" * 60)
print("✅ Database seeded successfully!")
print("\n📋 Login Credentials:")
print("=" * 40)
print("🔑 Admin:   admin@lju.edu.in   / admin123")
print("🔑 HOD:     hod@lju.edu.in     / hod123")
print("🔑 Faculty: fac@lju.edu.in     / fac123")
print("🔑 Student: rushi@lju.edu.in   / rushi123")
print("🔑 Parent:  parent1@lju.edu.in  / parent123")
print("=" * 40)
print(f"\n📊 Summary:")
print(f"  Departments: {Department.objects.count()}")
print(f"  Users:       {User.objects.count()}")
print(f"  Faculty:     {Faculty.objects.count()}")
print(f"  Students:    {Student.objects.count()}")
print(f"  Courses:     {Course.objects.count()}")
print(f"  Enrollments: {Enrollment.objects.count()}")
print(f"  Attendance:  {AttendanceRecord.objects.count()}")
print(f"  Grades:      {Grade.objects.count()}")
print(f"  Fees:        {Fee.objects.count()}")
print(f"  Timetable:   {Schedule.objects.count()}")
print(f"  Notices:     {Notice.objects.count()}")
print(f"  Complaints:  {Complaint.objects.count()}")
print(f"  Content:     {StudyMaterial.objects.count()}")
print(f"  Doubts:      {Doubt.objects.count()}")
print(f"  Alumni:      {Alumnus.objects.count()}")
print(f"  Feedback:    {FacultyFeedback.objects.count()}")
print(f"  Companies:   {PlacementCompany.objects.count()}")
print(f"  Parents:     {Parent.objects.count()}")
print(f"  Backlogs:    {Backlog.objects.count()}")
print(f"  Exams:       {Exam.objects.count()}")
