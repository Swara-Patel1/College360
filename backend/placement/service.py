"""
Turns a student's real academic record into a placement-readiness score object,
using the trained model in `ml.py`. Output matches what the React Placement page expects.
"""
from django.utils import timezone

from grades.models import Grade
from attendance.models import AttendanceRecord
from campus.models import Doubt
from .models import PlacementCompany
from . import ml


def _extract_features(student):
    """Derive (cpi, attendance_pct, active_backlogs, extra_count) from real data."""
    grades = list(Grade.objects.filter(student=student))
    if grades:
        cpi = round(sum(g.grade_point for g in grades) / len(grades), 2)
        active_backlogs = sum(1 for g in grades if g.grade == 'F')
    else:
        cpi, active_backlogs = 0.0, 0

    att_total = AttendanceRecord.objects.filter(student=student).count()
    att_present = AttendanceRecord.objects.filter(student=student, status__in=['present', 'late']).count()
    attendance_pct = round((att_present / att_total) * 100, 1) if att_total else 0.0

    # Engagement proxy for extracurriculars: how actively the student raises doubts.
    extra_count = min(3, Doubt.objects.filter(student=student).count())

    return cpi, attendance_pct, active_backlogs, extra_count, bool(grades or att_total)


def _category(score, has_history):
    if not has_history:
        return 'insufficient'
    if score >= 75:
        return 'high'
    if score >= 55:
        return 'medium'
    if score >= 35:
        return 'low'
    return 'critical'


def _tips(cpi, attendance_pct, backlogs, extra_count, category):
    tips = []
    if cpi < 7.0:
        tips.append(f'Lift your CPI above 7.0 (currently {cpi}) to unlock more recruiters.')
    if attendance_pct < 75:
        tips.append(f'Attendance is {attendance_pct}% — most companies require ≥75%. Attend regularly.')
    if backlogs > 0:
        tips.append(f'Clear your {backlogs} active backlog(s); many recruiters allow zero.')
    if extra_count < 2:
        tips.append('Add projects, certifications or club activity to strengthen your profile.')
    if category in ('high', 'medium'):
        tips.append('Practice aptitude and mock interviews to convert eligibility into offers.')
    return tips[:5]


def compute_placement(student):
    cpi, attendance_pct, backlogs, extra_count, has_history = _extract_features(student)

    # Trained model → placement-readiness probability → 0-100 headline score.
    prob = ml.predict_probability(cpi, attendance_pct, backlogs, extra_count)
    total_score = round(prob * 100, 1) if has_history else 0.0
    category = _category(total_score, has_history)

    # Transparent factor breakdown (drives the progress bars in the UI).
    cpi_score = round(cpi / 10 * 40, 1)
    attendance_score = round(attendance_pct / 100 * 20, 1)
    backlog_score = round(max(0.0, 25 - backlogs * 8.34), 1)
    extra_score = round(min(15.0, 5 + extra_count * 3.5), 1)

    # Eligible companies from real criteria.
    eligible_ids = []
    for c in PlacementCompany.objects.filter(is_active=True):
        if cpi >= float(c.min_cpi) and backlogs <= c.max_backlogs and attendance_pct >= float(c.min_attendance):
            eligible_ids.append(str(c.pk))

    return {
        'student_id': str(student.pk),
        'total_score': total_score,
        'placement_probability': round(prob, 4),
        'category': category,
        'cpi': cpi,
        'cpi_score': cpi_score,
        'attendance_pct': attendance_pct,
        'attendance_score': attendance_score,
        'active_backlogs': backlogs,
        'backlog_score': backlog_score,
        'extra_activities': extra_count > 0,
        'extra_score': extra_score,
        'eligible_company_ids': eligible_ids,
        'improvement_tips': _tips(cpi, attendance_pct, backlogs, extra_count, category),
        'model': 'logistic-regression (numpy, trained on synthetic placement data)',
        'computed_at': timezone.now().isoformat(),
    }
