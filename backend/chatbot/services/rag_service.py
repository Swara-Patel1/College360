"""
RAG Service — Retrieval-Augmented Generation context builder.

Queries the student's live data from the Django ORM (the app was consolidated
onto Django + SQLite; the old Supabase REST layer was removed). Given a student
and their message, it detects intents and assembles a focused context string.
"""
import logging
from datetime import date, timedelta

from django.db.models import Q

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


def _resolve_student(user, supabase_user_id=None):
    """Find the Student for the request — by auth user, then by the passed id or email."""
    from students.models import Student
    stu = getattr(user, 'student_profile', None)
    if stu:
        return stu
    if user is not None and getattr(user, 'is_authenticated', False):
        stu = Student.objects.filter(user=user).select_related('user', 'department').first()
        if stu:
            return stu
        if hasattr(user, 'email') and user.email:
            stu = Student.objects.filter(user__email=user.email).select_related('user', 'department').first()
            if stu:
                return stu

    val = str(supabase_user_id or '').strip()
    if val:
        qs = Student.objects.select_related('user', 'department')
        return (qs.filter(user__pk=val).first() if val.isdigit() else None) \
            or qs.filter(student_id=val).first()

    return Student.objects.select_related('user', 'department').first()


def build_rag_context(user, message, supabase_user_id=None):
    """Assemble prompt context for the student's question from the Django ORM."""
    student = _resolve_student(user, supabase_user_id)
    if not student:
        logger.warning("RAG: no student resolved for chat context.")
        return ""

    context_parts = []
    message_lower = (message or '').lower()

    dept_name = student.department.name if student.department else 'N/A'
    context_parts.append(
        "📋 STUDENT PROFILE:\n"
        f"• Name: {student.user.first_name} {student.user.last_name}\n"
        f"• Enrollment No: {student.student_id}\n"
        f"• Roll Number: {student.roll_number or 'N/A'}\n"
        f"• Department: {dept_name}\n"
        f"• Semester: {student.semester} (Year {student.year_of_study})\n"
    )

    detected_intents = _detect_intents(message_lower) or ['summary']

    dispatch = {
        'attendance': _get_attendance_data,
        'grades': _get_grades_data,
        'timetable': _get_timetable_data,
        'fees': _get_fees_data,
        'notices': lambda s: _get_notices_data(),
        'courses': _get_courses_data,
        'placement': _get_placement_data,
        'complaints': _get_complaints_data,
        'summary': _get_summary_data,
    }
    for intent in detected_intents:
        fn = dispatch.get(intent)
        if not fn:
            continue
        try:
            ctx = fn(student)
            if ctx:
                context_parts.append(ctx)
        except Exception as e:
            logger.warning(f"RAG: error building '{intent}' context: {e}")

    return "\n\n".join(context_parts)


def _detect_intents(message_lower):
    return [intent for intent, kws in INTENT_KEYWORDS.items()
            if any(kw in message_lower for kw in kws)]


# ── Intent data builders (Django ORM) ────────────────────────────────────────

def _get_attendance_data(student):
    from attendance.models import AttendanceRecord
    records = AttendanceRecord.objects.filter(student=student).select_related('course')
    if not records:
        return "📊 ATTENDANCE DATA:\nNo attendance records found."

    by_course = {}
    for r in records:
        key = f"{r.course.code} — {r.course.name}"
        d = by_course.setdefault(key, {'total': 0, 'present': 0})
        d['total'] += 1
        if (r.status or '').lower() in ('present', 'p', 'late', 'l', 'excused', 'e'):
            d['present'] += 1

    lines = ["📊 ATTENDANCE DATA:"]
    tot = pres = 0
    for course, d in by_course.items():
        pct = round(d['present'] / d['total'] * 100, 1) if d['total'] else 0
        lines.append(f"• {course}: {d['present']}/{d['total']} ({pct}%)")
        tot += d['total']; pres += d['present']
    overall = round(pres / tot * 100, 1) if tot else 0
    lines.append(f"\n• Overall Attendance: {pres}/{tot} ({overall}%)")
    return "\n".join(lines)


def _get_grades_data(student):
    from grades.models import Grade
    records = Grade.objects.filter(student=student).select_related('course')
    if not records:
        return "📝 GRADES DATA:\nNo grade records found."

    lines = ["📝 GRADES DATA:"]
    backlogs = []
    total_credits = weighted = 0
    for g in records:
        course = f"{g.course.code} — {g.course.name}"
        lines.append(f"• {course}: Grade {g.grade or '—'} "
                     f"({g.marks_obtained}/{g.total_marks}, {g.percentage()}%)")
        credits = int(getattr(g.course, 'credits', 3) or 3)
        total_credits += credits
        weighted += g.grade_point() * credits
        if (g.grade or '').upper() == 'F':
            backlogs.append(course)

    cgpa = round(weighted / total_credits, 2) if total_credits else 0
    lines.append(f"\n• Calculated CGPA: {cgpa}/10")
    lines.append(f"• Total Credits: {total_credits}")
    lines.append(f"• ⚠️ Backlogs ({len(backlogs)}): {', '.join(backlogs)}" if backlogs
                 else "• ✅ No backlogs")
    return "\n".join(lines)


def _get_timetable_data(student):
    from timetable.models import Schedule
    schedules = (Schedule.objects.filter(
        course__department=student.department, course__semester=student.semester, is_active=True)
        .select_related('course', 'faculty__user'))
    today = date.today()
    day_name = today.strftime('%A').lower()

    def fmt(s):
        fac = f"{s.faculty.user.first_name} {s.faculty.user.last_name}".strip() if s.faculty and s.faculty.user else 'TBA'
        return (f"• {str(s.start_time)[:5]} - {str(s.end_time)[:5]}: {s.course.name} "
                f"| Room: {s.room or 'TBA'} | Faculty: {fac}")

    lines = [f"📅 TIMETABLE — {today.strftime('%A, %d %B %Y')}:"]
    today_s = [s for s in schedules if (s.day or '').lower() == day_name]
    if today_s:
        lines += [fmt(s) for s in today_s]
    else:
        lines.append("No classes scheduled for today.")
        tom = (today + timedelta(days=1)).strftime('%A')
        tom_s = [s for s in schedules if (s.day or '').lower() == tom.lower()]
        if tom_s:
            lines.append(f"\nTomorrow ({tom}):")
            lines += [fmt(s) for s in tom_s]
    return "\n".join(lines)


def _get_fees_data(student):
    from fees.models import Fee
    fees = Fee.objects.filter(student=student)
    if not fees:
        return "💰 FEES DATA:\nNo fee records found."

    lines = ["💰 FEES DATA:"]
    paid = pending = 0.0
    for f in fees:
        amt = float(f.amount or 0)
        icon = '✅' if f.status == 'paid' else '🔴' if f.status == 'overdue' else '⚠️'
        lines.append(f"• {f.get_fee_type_display()}: ₹{amt:,.2f} — {icon} {f.status.title()}")
        if f.status == 'paid':
            paid += amt
        elif f.status in ('pending', 'overdue'):
            pending += amt
    lines.append(f"\n• Total Paid: ₹{paid:,.2f}")
    lines.append(f"• Total Pending: ₹{pending:,.2f}")
    return "\n".join(lines)


def _get_notices_data():
    from notices.models import Notice
    notices = Notice.objects.filter(is_active=True).order_by('-created_at')[:5]
    if not notices:
        return "📢 NOTICES:\nNo active notices."
    lines = ["📢 RECENT NOTICES:"]
    for n in notices:
        icon = '🚨' if n.notice_type == 'urgent' else '📋'
        lines.append(f"• {icon} [{n.notice_type.upper()}] {n.title} ({str(n.created_at)[:10]})")
        if n.content:
            lines.append(f"  {n.content[:120]}")
    return "\n".join(lines)


def _get_courses_data(student):
    from courses.models import Enrollment
    enrollments = (Enrollment.objects.filter(student=student, is_active=True)
                   .select_related('course'))
    if not enrollments:
        return "📚 ENROLLED COURSES:\nNo active course enrollments found."
    lines = ["📚 ENROLLED COURSES:"]
    for e in enrollments:
        c = e.course
        lines.append(f"• {c.code} — {c.name} | Credits: {getattr(c, 'credits', 3)}")
    return "\n".join(lines)


def _get_placement_data(student):
    lines = ["🎯 PLACEMENT ELIGIBILITY:"]
    lines.append(f"• Department: {student.department.name if student.department else 'N/A'}")
    try:
        from placement.service import compute_placement
        score = compute_placement(student)
        if isinstance(score, dict):
            for k in ('total_score', 'readiness', 'cpi', 'attendance', 'backlogs'):
                if k in score:
                    lines.append(f"• {k.replace('_', ' ').title()}: {score[k]}")
    except Exception as e:
        logger.warning(f"RAG placement: {e}")
    lines.append("\n💡 Prepare for DSA/technical rounds and build strong projects.")
    return "\n".join(lines)


def _get_complaints_data(student):
    from complaints.models import Complaint
    complaints = Complaint.objects.filter(student=student).order_by('-created_at')[:5]
    if not complaints:
        return "📣 COMPLAINTS:\nNo complaints filed."
    lines = ["📣 MY COMPLAINTS:"]
    for c in complaints:
        icon = '✅' if c.status == 'resolved' else '🟡'
        lines.append(f"• {icon} {c.title} — Status: {c.get_status_display()}")
    return "\n".join(lines)


def _get_summary_data(student):
    parts = []
    try:
        from grades.models import Grade
        grades = list(Grade.objects.filter(student=student).select_related('course'))
        if grades:
            tc = sum(int(getattr(g.course, 'credits', 3) or 3) for g in grades)
            wp = sum(g.grade_point() * int(getattr(g.course, 'credits', 3) or 3) for g in grades)
            if tc:
                parts.append(f"• CGPA: {round(wp / tc, 2)}/10")
    except Exception:
        pass
    try:
        from fees.models import Fee
        pending = Fee.objects.filter(student=student, status__in=['pending', 'overdue']).count()
        parts.append(f"• Pending Fees: {pending} outstanding." if pending else "• Fees: All paid ✅")
    except Exception:
        pass
    return "📋 QUICK SUMMARY:\n" + "\n".join(parts) if parts else ""
