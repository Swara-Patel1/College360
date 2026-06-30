"""
Seed script to populate the database with sample data.
Run with: python manage.py shell < seed_data.py
"""
import os
import django
import sys
import random
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'college_management.settings')
django.setup()

from accounts.models import User
from faculty.models import Faculty, Department
from students.models import Student
from courses.models import Course, Enrollment
from attendance.models import AttendanceRecord
from grades.models import Grade
from fees.models import Fee
from timetable.models import Schedule
from notices.models import Notice

print("🌱 Seeding database...")

# Clear existing data
print("Clearing existing data...")
AttendanceRecord.objects.all().delete()
Grade.objects.all().delete()
Fee.objects.all().delete()
Schedule.objects.all().delete()
Enrollment.objects.all().delete()
Notice.objects.all().delete()
Course.objects.all().delete()
Student.objects.all().delete()
Faculty.objects.all().delete()
Department.objects.all().delete()
User.objects.filter(is_superuser=False).delete()

# Create Admin
print("Creating admin...")
admin = User.objects.create_superuser(
    username='admin', email='admin@college.edu',
    password='admin123', first_name='Admin', last_name='User',
    role='admin', phone='9876543210'
)

# Create Departments
print("Creating departments...")
departments = [
    Department.objects.create(name='Computer Science', code='CS', description='Department of Computer Science & Engineering'),
    Department.objects.create(name='Electronics & Communication', code='EC', description='Department of Electronics & Communication Engineering'),
    Department.objects.create(name='Mechanical Engineering', code='ME', description='Department of Mechanical Engineering'),
    Department.objects.create(name='Civil Engineering', code='CE', description='Department of Civil Engineering'),
    Department.objects.create(name='Business Administration', code='MBA', description='Department of Business Administration'),
]

# Create Faculty Users
print("Creating faculty...")
faculty_data = [
    ('Dr. Rajesh Kumar', 'rajesh.kumar', 'F001', 'CS', 'professor', 'Ph.D Computer Science', 15),
    ('Prof. Priya Sharma', 'priya.sharma', 'F002', 'CS', 'associate_professor', 'M.Tech', 10),
    ('Dr. Amit Singh', 'amit.singh', 'F003', 'EC', 'professor', 'Ph.D Electronics', 12),
    ('Prof. Sunita Patel', 'sunita.patel', 'F004', 'ME', 'assistant_professor', 'M.E', 6),
    ('Dr. Rohit Gupta', 'rohit.gupta', 'F005', 'CE', 'hod', 'Ph.D Civil Engg', 20),
    ('Prof. Meena Joshi', 'meena.joshi', 'F006', 'MBA', 'associate_professor', 'MBA, Ph.D', 8),
]

dept_map = {d.code: d for d in departments}
faculty_objs = []
for full_name, username, fid, dept_code, designation, qual, exp in faculty_data:
    first, *last = full_name.split()
    user = User.objects.create_user(
        username=username, email=f'{username}@college.edu',
        password='faculty123', first_name=full_name.split()[0],
        last_name=' '.join(full_name.split()[1:]), role='faculty',
        phone=f'98765{random.randint(10000, 99999)}'
    )
    fac = Faculty.objects.create(
        user=user, faculty_id=fid, department=dept_map[dept_code],
        designation=designation, qualification=qual,
        experience_years=exp, joining_date=date(2020, 6, 1),
        salary=random.randint(50000, 120000)
    )
    faculty_objs.append(fac)

# Create Courses
print("Creating courses...")
course_data = [
    ('Data Structures & Algorithms', 'CS101', 'CS', faculty_objs[0], 4, 1),
    ('Database Management Systems', 'CS102', 'CS', faculty_objs[1], 3, 2),
    ('Operating Systems', 'CS201', 'CS', faculty_objs[0], 4, 3),
    ('Computer Networks', 'CS202', 'CS', faculty_objs[1], 3, 4),
    ('Machine Learning', 'CS301', 'CS', faculty_objs[0], 4, 5),
    ('Digital Electronics', 'EC101', 'EC', faculty_objs[2], 4, 1),
    ('Signal Processing', 'EC201', 'EC', faculty_objs[2], 3, 3),
    ('Thermodynamics', 'ME101', 'ME', faculty_objs[3], 4, 1),
    ('Fluid Mechanics', 'ME201', 'ME', faculty_objs[3], 3, 3),
    ('Structural Analysis', 'CE101', 'CE', faculty_objs[4], 4, 1),
    ('Marketing Management', 'MBA101', 'MBA', faculty_objs[5], 3, 1),
    ('Financial Accounting', 'MBA102', 'MBA', faculty_objs[5], 3, 2),
]

course_objs = []
for name, code, dept_code, faculty, credits, sem in course_data:
    c = Course.objects.create(
        name=name, code=code, department=dept_map[dept_code],
        faculty=faculty, credits=credits, semester=sem, max_students=60
    )
    course_objs.append(c)

# Create Student Users
print("Creating students...")
student_names = [
    ('Arjun Verma', 'arjun.verma', 'S001', 'CS', 'M', 3, 5),
    ('Priya Mehta', 'priya.mehta', 'S002', 'CS', 'F', 2, 3),
    ('Rahul Shah', 'rahul.shah', 'S003', 'CS', 'M', 1, 1),
    ('Ananya Iyer', 'ananya.iyer', 'S004', 'CS', 'F', 4, 7),
    ('Vikram Rao', 'vikram.rao', 'S005', 'CS', 'M', 2, 4),
    ('Sneha Kapoor', 'sneha.kapoor', 'S006', 'EC', 'F', 3, 5),
    ('Karan Malhotra', 'karan.malhotra', 'S007', 'EC', 'M', 1, 2),
    ('Divya Singh', 'divya.singh', 'S008', 'ME', 'F', 2, 3),
    ('Aditya Kumar', 'aditya.kumar', 'S009', 'ME', 'M', 3, 6),
    ('Riya Patel', 'riya.patel', 'S010', 'CE', 'F', 1, 1),
    ('Sanjay Gupta', 'sanjay.gupta', 'S011', 'MBA', 'M', 2, 4),
    ('Pooja Sharma', 'pooja.sharma', 'S012', 'CS', 'F', 4, 7),
    ('Nikhil Joshi', 'nikhil.joshi', 'S013', 'CS', 'M', 1, 2),
    ('Kavita Reddy', 'kavita.reddy', 'S014', 'EC', 'F', 3, 5),
    ('Amit Tiwari', 'amit.tiwari', 'S015', 'ME', 'M', 2, 4),
]

student_objs = []
for full_name, username, sid, dept_code, gender, year, sem in student_names:
    user = User.objects.create_user(
        username=username, email=f'{username}@student.college.edu',
        password='student123', first_name=full_name.split()[0],
        last_name=' '.join(full_name.split()[1:]), role='student',
        phone=f'98765{random.randint(10000, 99999)}'
    )
    s = Student.objects.create(
        user=user, student_id=sid, department=dept_map[dept_code],
        roll_number=f'{dept_code}{sid}', gender=gender,
        year_of_study=year, semester=sem,
        admission_date=date(2022, 7, 15),
        blood_group=random.choice(['A+', 'B+', 'O+', 'AB+']),
        guardian_name=f'{full_name.split()[1]} Sr.',
        guardian_phone=f'98765{random.randint(10000, 99999)}'
    )
    student_objs.append(s)

# Enroll CS students in CS courses
print("Creating enrollments...")
cs_students = [s for s in student_objs if s.department.code == 'CS']
cs_courses = [c for c in course_objs if c.department.code == 'CS']
for student in cs_students:
    for course in cs_courses[:3]:
        Enrollment.objects.create(student=student, course=course)

ec_students = [s for s in student_objs if s.department.code == 'EC']
for student in ec_students:
    for course in [c for c in course_objs if c.department.code == 'EC']:
        Enrollment.objects.create(student=student, course=course)

me_students = [s for s in student_objs if s.department.code == 'ME']
for student in me_students:
    for course in [c for c in course_objs if c.department.code == 'ME']:
        Enrollment.objects.create(student=student, course=course)

# Create Attendance Records (last 30 days)
print("Creating attendance records...")
today = date.today()
for i in range(20):
    att_date = today - timedelta(days=i)
    if att_date.weekday() < 6:  # Exclude Sundays
        for student in cs_students[:5]:
            for course in cs_courses[:2]:
                status = random.choices(['present', 'absent', 'late'],
                                        weights=[70, 20, 10])[0]
                AttendanceRecord.objects.get_or_create(
                    student=student, course=course, date=att_date,
                    defaults={'status': status, 'marked_by': admin}
                )

# Create Grades
print("Creating grades...")
for student in cs_students:
    for course in cs_courses[:3]:
        marks = random.randint(45, 98)
        Grade.objects.create(
            student=student, course=course,
            exam_type='Final', marks_obtained=marks,
            total_marks=100, graded_by=admin,
            exam_date=date(2024, 11, 15)
        )

# Create Fees
print("Creating fees...")
fee_types = ['tuition', 'exam', 'library', 'sports']
for student in student_objs:
    for fee_type in fee_types:
        amount = {'tuition': 45000, 'exam': 2000, 'library': 1000, 'sports': 500}[fee_type]
        status = random.choice(['paid', 'paid', 'pending', 'overdue'])
        Fee.objects.create(
            student=student, fee_type=fee_type,
            amount=amount, due_date=date(2024, 12, 31),
            status=status,
            payment_date=date(2024, 10, 1) if status == 'paid' else None,
            academic_year='2024-25'
        )

# Create Timetable
print("Creating timetable...")
days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
times = [('09:00', '10:00'), ('10:00', '11:00'), ('11:00', '12:00'),
         ('14:00', '15:00'), ('15:00', '16:00')]
rooms = ['Room 101', 'Room 102', 'Room 201', 'Lab A', 'Lab B']

for i, course in enumerate(cs_courses[:5]):
    Schedule.objects.create(
        course=course, faculty=course.faculty,
        day=days[i % 5],
        start_time=times[i % 5][0],
        end_time=times[i % 5][1],
        room=rooms[i % 5]
    )

# Create Notices
print("Creating notices...")
notice_data = [
    ('Mid-Semester Examination Schedule', 'Mid-semester exams will be held from November 15-25, 2024. All students are advised to prepare accordingly. Admit cards will be distributed one week before.', 'exam', 'all', admin),
    ('New Course Registration Open', 'Registration for next semester courses is now open. Students can register through the portal until December 10, 2024.', 'general', 'students', admin),
    ('Faculty Development Program', 'A 3-day Faculty Development Program on AI & ML will be held on December 5-7, 2024. All faculty members are encouraged to participate.', 'event', 'faculty', faculty_objs[0].user),
    ('Holiday Notice - Diwali', 'The college will remain closed from November 1-3, 2024 on account of Diwali festival. Classes will resume on November 4, 2024.', 'holiday', 'all', admin),
    ('Annual Sports Day', 'Annual Sports Day will be celebrated on December 20, 2024. All students are encouraged to participate in various sports events.', 'event', 'all', admin),
    ('Fee Submission Deadline', 'Last date for fee submission for the current semester is December 31, 2024. Students with pending fees are requested to clear dues immediately.', 'urgent', 'students', admin),
]
for title, content, ntype, audience, posted_by in notice_data:
    Notice.objects.create(
        title=title, content=content, notice_type=ntype,
        audience=audience, posted_by=posted_by
    )

print("\n✅ Database seeded successfully!")
print("\n📋 Login Credentials:")
print("=" * 40)
print("🔑 Admin:   admin / admin123")
print("🔑 Faculty: rajesh.kumar / faculty123")
print("🔑 Student: arjun.verma / student123")
print("=" * 40)
print(f"\n📊 Summary:")
print(f"  Departments: {Department.objects.count()}")
print(f"  Faculty:     {Faculty.objects.count()}")
print(f"  Students:    {Student.objects.count()}")
print(f"  Courses:     {Course.objects.count()}")
print(f"  Enrollments: {Enrollment.objects.count()}")
print(f"  Attendance:  {AttendanceRecord.objects.count()}")
print(f"  Grades:      {Grade.objects.count()}")
print(f"  Fees:        {Fee.objects.count()}")
print(f"  Notices:     {Notice.objects.count()}")
