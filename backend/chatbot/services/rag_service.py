"""
RAG Service — Retrieval-Augmented Generation context builder.
Queries the student's data from the Supabase PostgreSQL database via REST API.
"""
import logging
import requests
from datetime import date, timedelta
from django.conf import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Intent keywords — maps question topics to data retrieval functions
# ──────────────────────────────────────────────────────────────
INTENT_KEYWORDS = {
    'attendance': [
        'attendance', 'present', 'absent', 'late', 'excused',
        'attendance percentage', 'classes attended', 'bunked',
    ],
    'grades': [
        'grade', 'cgpa', 'sgpa', 'gpa', 'marks', 'result', 'score',
        'backlog', 'fail', 'failed', 'pass', 'percentage', 'rank',
        'topper', 'marks obtained', 'exam result',
    ],
    'timetable': [
        'timetable', 'schedule', 'class', 'lecture', 'today',
        'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday',
        'friday', 'saturday', 'time table', 'next class',
    ],
    'fees': [
        'fee', 'fees', 'payment', 'paid', 'pending', 'due',
        'tuition', 'hostel fee', 'exam fee', 'overdue', 'amount',
        'transaction', 'waived',
    ],
    'notices': [
        'notice', 'announcement', 'circular', 'event', 'holiday',
        'upcoming', 'news', 'update', 'notification',
    ],
    'courses': [
        'course', 'subject', 'enrolled', 'enrollment', 'credits',
        'elective', 'semester courses', 'registered',
    ],
    'placement': [
        'placement', 'company', 'companies', 'eligible', 'eligibility',
        'job', 'internship', 'interview', 'recruit', 'package',
        'placement score', 'career', 'hire', 'hiring',
    ],
    'profile': [
        'my name', 'my profile', 'my details', 'who am i',
        'my department', 'my branch', 'my semester', 'my year',
        'my roll number', 'student id', 'my info',
    ],
    'complaints': [
        'complaint', 'grievance', 'issue', 'problem', 'complain',
        'status of complaint', 'my complaints',
    ],
}


# Create a persistent global session for connection pooling (makes subsequent requests 6x faster)
_session = requests.Session()

def _supabase_request(table_or_path, query_params=None):
    """Helper to perform requests to Supabase Rest API using connection pooling."""
    url = f"{settings.SUPABASE_URL}/rest/v1/{table_or_path}"
    headers = {
        'apikey': settings.SUPABASE_ANON_KEY,
        'Authorization': f"Bearer {settings.SUPABASE_ANON_KEY}",
        'Content-Type': 'application/json',
    }
    try:
        response = _session.get(url, headers=headers, params=query_params)
        if response.status_code == 200:
            return response.json()
        logger.warning(f"Supabase request failed: {response.status_code} - {response.text}")
        return []
    except Exception as e:
        logger.error(f"Error calling Supabase API: {e}")
        return []


def build_rag_context(user, message, supabase_user_id=None):
    """
    Queries live student data from Supabase and builds prompt context.
    """
    if not supabase_user_id:
        logger.warning("No Supabase user ID provided for context retrieval.")
        return ""

    context_parts = []
    message_lower = message.lower()

    # 1. Fetch Student Profile from Supabase
    student_rows = _supabase_request(
        'students',
        {'select': '*,department:departments(*),current_semester:semesters(*)', 'user_id': f'eq.{supabase_user_id}'}
    )

    if not student_rows:
        logger.warning(f"Student not found in Supabase for user_id: {supabase_user_id}")
        return ""

    student = student_rows[0]
    student_id = student.get('student_id')

    # Add basic profile info
    profile_ctx = (
        f"📋 STUDENT PROFILE:\n"
        f"• Name: {student.get('first_name', '')} {student.get('last_name', '')}\n"
        f"• Enrollment No: {student.get('enrollment_no', 'N/A')}\n"
        f"• Roll Number: {student.get('current_rollno') or 'N/A'}\n"
        f"• Department: {student.get('department', {}).get('name', 'N/A')}\n"
        f"• Semester: {student.get('current_semester', {}).get('number', 'N/A')}\n"
    )
    context_parts.append(profile_ctx)

    # Detect user intents
    detected_intents = _detect_intents(message_lower)
    if not detected_intents:
        detected_intents = ['summary']

    for intent in detected_intents:
        try:
            if intent == 'attendance':
                ctx = _get_attendance_data(student_id)
            elif intent == 'grades':
                ctx = _get_grades_data(student_id)
            elif intent == 'timetable':
                ctx = _get_timetable_data(student_id, student.get('department_id'), student.get('current_semester_id'))
            elif intent == 'fees':
                ctx = _get_fees_data(student_id)
            elif intent == 'notices':
                ctx = _get_notices_data()
            elif intent == 'courses':
                ctx = _get_courses_data(student_id)
            elif intent == 'placement':
                ctx = _get_placement_data(student_id, student.get('department', {}).get('name', 'N/A'))
            elif intent == 'complaints':
                ctx = _get_complaints_data(student_id)
            elif intent == 'summary':
                ctx = _get_summary_data(student_id)
            else:
                ctx = None

            if ctx:
                context_parts.append(ctx)
        except Exception as e:
            logger.warning(f"Error retrieving {intent} data from Supabase: {e}")
            continue

    return "\n\n".join(context_parts)


def _detect_intents(message_lower):
    detected = []
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(kw in message_lower for kw in keywords):
            detected.append(intent)
    return detected


def _get_attendance_data(student_id):
    records = _supabase_request(
        'attendance_records',
        {'select': '*,course:subjects(*)', 'student_id': f'eq.{student_id}'}
    )
    if not records:
        return "📊 ATTENDANCE DATA:\nNo attendance records found."

    course_attendance = {}
    for r in records:
        c = r.get('course') or {}
        course_name = f"{c.get('code', 'N/A')} — {c.get('name', 'N/A')}"
        if course_name not in course_attendance:
            course_attendance[course_name] = {'total': 0, 'present': 0}
        
        course_attendance[course_name]['total'] += 1
        db_status = r.get('status', '').upper()
        if db_status in ('P', 'PRESENT', 'L', 'LATE'):
            course_attendance[course_name]['present'] += 1

    lines = ["📊 ATTENDANCE DATA:"]
    total_classes = 0
    total_present = 0

    for course, data in course_attendance.items():
        pct = round((data['present'] / data['total']) * 100, 1) if data['total'] > 0 else 0
        lines.append(f"• {course}: {data['present']}/{data['total']} ({pct}%)")
        total_classes += data['total']
        total_present += data['present']

    overall_pct = round((total_present / total_classes) * 100, 1) if total_classes > 0 else 0
    lines.append(f"\n• Overall Attendance: {total_present}/{total_classes} ({overall_pct}%)")
    return "\n".join(lines)


def _get_grades_data(student_id):
    records = _supabase_request(
        'marks',
        {'select': '*,course:subjects(*)', 'student_id': f'eq.{student_id}'}
    )
    if not records:
        return "📝 GRADES DATA:\nNo grade records found."

    lines = ["📝 GRADES DATA:"]
    backlogs = []

    grade_points = {
        'O': 10, 'AA': 9, 'AB': 8, 'BB': 7,
        'BC': 6.5, 'CC': 6, 'CD': 5, 'DD': 4, 'F': 0
    }

    total_credits = 0
    total_weighted_points = 0

    for r in records:
        c = r.get('course') or {}
        course_name = f"{c.get('code', 'N/A')} — {c.get('name', 'N/A')}"
        grade = r.get('grade', 'F')
        internal = float(r.get('internal_marks') or 0)
        external = float(r.get('external_marks') or 0)
        total = float(r.get('total_marks') or (internal + external))
        
        lines.append(f"• {course_name}: Grade {grade} (Marks: {total})")

        credits = int(c.get('credits') or 3)
        gp = grade_points.get(grade, 0)
        total_credits += credits
        total_weighted_points += gp * credits

        if grade == 'F':
            backlogs.append(course_name)

    cgpa = round(total_weighted_points / total_credits, 2) if total_credits > 0 else 0
    lines.append(f"\n• Calculated CGPA: {cgpa}/10")
    lines.append(f"• Total Credits: {total_credits}")

    if backlogs:
        lines.append(f"• ⚠️ Backlogs ({len(backlogs)}): {', '.join(backlogs)}")
    else:
        lines.append("• ✅ No backlogs")

    return "\n".join(lines)


def _get_timetable_data(student_id, department_id, semester_id):
    # Fetch timetable entries matching department and semester
    schedules = _supabase_request(
        'timetable',
        {
            'select': '*,course:subjects(*),faculty:faculty(*)',
            'course.department_id': f'eq.{department_id}',
            'course.semester_id': f'eq.{semester_id}'
        }
    )
    
    today = date.today()
    day_name = today.strftime('%A').lower()
    
    lines = [f"📅 TIMETABLE — {today.strftime('%A, %d %B %Y')}:"]
    
    today_schedules = [s for s in schedules if s.get('day_of_week', '').lower() == day_name]
    
    if not today_schedules:
        lines.append("No classes scheduled for today.")
        # Show tomorrow
        tomorrow = today + timedelta(days=1)
        tom_day = tomorrow.strftime('%A').lower()
        tom_schedules = [s for s in schedules if s.get('day_of_week', '').lower() == tom_day]
        if tom_schedules:
            lines.append(f"\nTomorrow ({tomorrow.strftime('%A')}):")
            for s in tom_schedules:
                c = s.get('course') or {}
                fac = s.get('faculty') or {}
                fac_name = f"{fac.get('first_name','')} {fac.get('last_name','')}".strip() or 'TBA'
                lines.append(f"• {s.get('start_time','')} - {s.get('end_time','')}: {c.get('name','')} | Room: {s.get('room_no','TBA')} | Faculty: {fac_name}")
    else:
        for s in today_schedules:
            c = s.get('course') or {}
            fac = s.get('faculty') or {}
            fac_name = f"{fac.get('first_name','')} {fac.get('last_name','')}".strip() or 'TBA'
            lines.append(f"• {s.get('start_time','')} - {s.get('end_time','')}: {c.get('name','')} | Room: {s.get('room_no','TBA')} | Faculty: {fac_name}")
            
    return "\n".join(lines)


def _get_fees_data(student_id):
    payments = _supabase_request(
        'fee_payments',
        {'select': '*,fee_structures(*)', 'student_id': f'eq.{student_id}'}
    )
    if not payments:
        return "💰 FEES DATA:\nNo fee payments found."

    lines = ["💰 FEES DATA:"]
    total_paid = 0
    total_pending = 0

    for p in payments:
        struct = p.get('fee_structures') or {}
        comp_name = struct.get('component_name', 'Tuition Fee')
        amount = float(struct.get('amount') or 0)
        status = p.get('status', 'pending')
        
        status_icon = '✅' if status == 'paid' else '⚠️' if status == 'pending' else '🔴'
        lines.append(f"• {comp_name}: ₹{amount:,.2f} — {status_icon} {status.title()}")
        
        if status == 'paid':
            total_paid += amount
        else:
            total_pending += amount

    lines.append(f"\n• Total Paid: ₹{total_paid:,.2f}")
    lines.append(f"• Total Pending: ₹{total_pending:,.2f}")
    return "\n".join(lines)


def _get_notices_data():
    notices = _supabase_request(
        'notices',
        {'select': '*,author:users(*)', 'order': 'published_at.desc', 'limit': '5'}
    )
    if not notices:
        return "📢 NOTICES:\nNo active notices."

    lines = ["📢 RECENT NOTICES:"]
    for n in notices:
        prio = n.get('priority', 'NORMAL').upper()
        prio_icon = '🚨' if prio == 'URGENT' else '📋'
        lines.append(f"• {prio_icon} [{prio}] {n.get('title')} ({n.get('published_at', '')[:10]})")
        lines.append(f"  {n.get('content', '')[:120]}...")
        
    return "\n".join(lines)


def _get_courses_data(student_id):
    enrollments = _supabase_request(
        'enrollments',
        {'select': '*,course:subjects(*)', 'student_id': f'eq.{student_id}'}
    )
    if not enrollments:
        return "📚 ENROLLED COURSES:\nNo active course enrollments found."

    lines = ["📚 ENROLLED COURSES:"]
    for e in enrollments:
        c = e.get('course') or {}
        lines.append(f"• {c.get('code','')} — {c.get('name','')} | Credits: {c.get('credits', 3)}")
        
    return "\n".join(lines)


def _get_placement_data(student_id, dept_name):
    scores = _supabase_request(
        'placement_scores',
        {'student_id': f'eq.{student_id}'}
    )
    
    # Also fetch grades to calculate CGPA
    grades_ctx = _get_grades_data(student_id)
    
    lines = ["🎯 PLACEMENT ELIGIBILITY:"]
    lines.append(f"• Department: {dept_name}")
    if scores:
        lines.append(f"• Placement Technical Score: {scores[0].get('total_score', 'N/A')}")
        
    if "Calculated CGPA" in grades_ctx:
        cgpa_line = [l for l in grades_ctx.split('\n') if "Calculated CGPA" in l][0]
        lines.append(f"• {cgpa_line.replace('• ', '')}")
        
    lines.append("\n💡 ELIGIBLE CAREER OPPORTUNITIES:")
    lines.append("• Prepare well for DSA and Technical Coding tests")
    lines.append("• Build projects using modern frontend frameworks like React")
    return "\n".join(lines)


def _get_complaints_data(student_id):
    complaints = _supabase_request(
        'grievances',
        {'student_id': f'eq.{student_id}', 'order': 'submitted_at.desc', 'limit': '5'}
    )
    if not complaints:
        return "📣 COMPLAINTS:\nNo complaints filed."

    lines = ["📣 MY COMPLAINTS:"]
    for c in complaints:
        status = c.get('status', 'OPEN')
        status_icon = '🟡' if status == 'OPEN' else '✅'
        lines.append(f"• {status_icon} Description: {c.get('description')} — Status: {status}")
        
    return "\n".join(lines)


def _get_summary_data(student_id):
    parts = []
    
    # 1. Quick CGPA summary
    try:
        grades = _supabase_request('marks', {'student_id': f'eq.{student_id}'})
        if grades:
            grade_points = {'O':10, 'AA':9, 'AB':8, 'BB':7, 'BC':6.5, 'CC':6, 'CD':5, 'DD':4, 'F':0}
            total_weighted = 0
            for g in grades:
                total_weighted += grade_points.get(g.get('grade','F'), 0)
            cgpa = round(total_weighted / len(grades), 2)
            parts.append(f"• CGPA: {cgpa}/10")
    except Exception:
        pass
        
    # 2. Quick Fee status
    try:
        fees = _supabase_request('fee_payments', {'student_id': f'eq.{student_id}', 'status': 'eq.pending'})
        if fees:
            parts.append(f"• Pending Fees: Yes, {len(fees)} payment(s) outstanding.")
        else:
            parts.append("• Fees: All paid ✅")
    except Exception:
        pass

    if parts:
        return "📋 QUICK SUMMARY:\n" + "\n".join(parts)
    return ""
