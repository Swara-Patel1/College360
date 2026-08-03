from django.db import connection
from django.utils import timezone

from . import ml


def _extract_features(student_input):
    """Derive (cpi, attendance_pct, active_backlogs, extra_count, has_history, student_id_str) from real PostgreSQL data."""
    student_id_str = ''
    if hasattr(student_input, 'student_id') and student_input.student_id:
        student_id_str = str(student_input.student_id)
    elif hasattr(student_input, 'pk'):
        student_id_str = str(student_input.pk)
    else:
        student_id_str = str(student_input)

    with connection.cursor() as cur:
        # Resolve student_id if student_id_str is user_id or email
        cur.execute("""
            SELECT CAST(student_id AS TEXT) FROM students
            WHERE CAST(student_id AS TEXT) = %s OR CAST(user_id AS TEXT) = %s
            LIMIT 1
        """, [student_id_str, student_id_str])
        r = cur.fetchone()
        if r:
            student_id_str = r[0]

        # 1. Marks & CPI (Dynamically parsed from JSON marks)
        cur.execute("""
            SELECT marks, grade_points, grade FROM marks
            WHERE CAST(student_id AS TEXT) = %s
        """, [student_id_str])
        marks_rows = cur.fetchall()
        gps = []
        backlog_cnt = 0
        import json
        for r in marks_rows:
            raw_m, gp, gr = r[0], r[1], r[2]
            if (gr or '').upper() in ('F', 'FF'):
                backlog_cnt += 1

            if isinstance(raw_m, str):
                try:
                    raw_m = json.loads(raw_m)
                except Exception:
                    raw_m = {}

            if isinstance(raw_m, dict) and raw_m:
                obtained = sum(float(v) for v in raw_m.values() if isinstance(v, (int, float, str)) and str(v).replace('.', '', 1).isdigit())
                total = 200.0 if obtained > 100 or len(raw_m) > 2 else 100.0
                pct = (obtained / total * 100.0) if total > 0 else 0.0
                gps.append(pct / 10.0)
            elif gp is not None and float(gp) > 0:
                gps.append(float(gp))

        if gps:
            cpi = round(sum(gps) / len(gps), 2)
            active_backlogs = backlog_cnt
        else:
            cpi, active_backlogs = 0.0, 0

        # 2. Attendance
        cur.execute("""
            SELECT COUNT(*),
                   SUM(CASE WHEN LOWER(CAST(status AS TEXT)) IN ('present', 'late', 'p', 'l') THEN 1 ELSE 0 END)
            FROM attendance_records
            WHERE CAST(student_id AS TEXT) = %s
        """, [student_id_str])
        att_row = cur.fetchone()
        att_total = att_row[0] if att_row else 0
        att_present = (att_row[1] or 0) if att_row else 0
        attendance_pct = round((att_present / att_total) * 100, 1) if att_total else 0.0

        # 3. Doubts / Extracurriculars
        cur.execute("""
            SELECT COUNT(*) FROM doubts
            WHERE CAST(student_id AS TEXT) = %s
        """, [student_id_str])
        doubt_row = cur.fetchone()
        extra_count = min(3, doubt_row[0] if doubt_row else 0)

    has_history = bool(marks_rows or att_total)
    return cpi, attendance_pct, active_backlogs, extra_count, has_history, student_id_str


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
    if category in ('high', 'medium'):
        tips.append('Practice aptitude and mock interviews to convert eligibility into offers.')
    return tips[:5]


def compute_placement(student):
    cpi, attendance_pct, backlogs, extra_count, has_history, student_id_str = _extract_features(student)

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
    with connection.cursor() as cur:
        cur.execute("""
            SELECT CAST(company_id AS TEXT), min_cpi, max_backlogs, min_attendance
            FROM placement_companies
            WHERE is_active = true
        """)
        for cid, min_cpi, max_b, min_att in cur.fetchall():
            if cpi >= float(min_cpi or 0) and backlogs <= int(max_b or 0) and attendance_pct >= float(min_att or 0):
                eligible_ids.append(cid)

    # Attach model evaluation metrics for UI display.
    metrics = ml.get_metrics()
    model_accuracy = metrics.get('accuracy')
    model_sensitivity = metrics.get('sensitivity')
    model_specificity = metrics.get('specificity')
    model_r2 = metrics.get('r2')
    cv_accuracy = metrics.get('cv_accuracy_mean')

    return {
        'student_id': student_id_str,
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
        'model': f'{ml._MODEL_TYPE} (scikit-learn)',
        'computed_at': timezone.now().isoformat(),
        # ML evaluation metrics exposed to the student UI
        'model_accuracy': round(model_accuracy * 100, 1) if model_accuracy is not None else None,
        'model_sensitivity': round(model_sensitivity * 100, 1) if model_sensitivity is not None else None,
        'model_specificity': round(model_specificity * 100, 1) if model_specificity is not None else None,
        'model_r2': round(model_r2 * 100, 1) if model_r2 is not None else None,
        'model_cv_accuracy': round(cv_accuracy * 100, 1) if cv_accuracy is not None else None,
    }
