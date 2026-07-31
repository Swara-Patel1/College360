"""
Analytics & computation services.

These functions move business logic that previously lived in the React client
(GPA/CGPA, attendance percentages, fee roll-ups, grade distributions and
dashboard aggregates) onto the server, computed from the real PostgreSQL
tables. Keeping them here makes the numbers authoritative and consistent
across every client.
"""
from django.db import connection

# 10-point grade → grade-point map used for CGPA when grade_points is absent.
GRADE_POINTS = {
    'AA': 10, 'AB': 9, 'BB': 8, 'BC': 7, 'CC': 6, 'CD': 5, 'DD': 4,
    'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 'C': 5, 'D': 4,
    'F': 0, 'FF': 0, 'P': 5,
}


def _dictfetchall(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def resolve_student_id(identifier):
    with connection.cursor() as cur:
        cur.execute("""
            SELECT CAST(s.student_id AS TEXT) FROM students s
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            WHERE CAST(s.student_id AS TEXT)=%s OR CAST(s.user_id AS TEXT)=%s OR LOWER(u.email)=LOWER(%s)
            LIMIT 1
        """, [str(identifier), str(identifier), str(identifier)])
        row = cur.fetchone()
    return row[0] if row else None


def _gp_for(grade, grade_points):
    if grade_points is not None:
        try:
            return float(grade_points)
        except (TypeError, ValueError):
            pass
    return float(GRADE_POINTS.get((grade or '').strip().upper(), 0))


# ──────────────────────────────────────────────────────────────────────────
# Student academic summary (CGPA, credits, attendance, backlogs)
# ──────────────────────────────────────────────────────────────────────────
def student_academic_summary(student_id):
    sid = resolve_student_id(student_id)
    if not sid:
        return None
    with connection.cursor() as cur:
        cur.execute("""
            SELECT sub.credits, sem.number AS semester, m.marks, m.grade, m.grade_points
            FROM marks m
            LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT)=CAST(m.subject_id AS TEXT)
            LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT)=CAST(m.semester_id AS TEXT)
            WHERE CAST(m.student_id AS TEXT)=%s
        """, [sid])
        marks = _dictfetchall(cur)
        cur.execute("""
            SELECT COALESCE(SUM(total_lectures),0) AS total,
                   COALESCE(SUM(present_count),0) AS present,
                   COUNT(*) FILTER (WHERE is_shortage) AS shortages
            FROM attendance_summary WHERE CAST(student_id AS TEXT)=%s
        """, [sid])
        att = cur.fetchone()

    total_cr = weighted = 0.0
    backlogs = 0
    sem_group = {}
    for m in marks:
        cr = float(m.get('credits') or 0)
        gp = _gp_for(m.get('grade'), m.get('grade_points'))
        total_cr += cr
        weighted += cr * gp
        if gp == 0 or (m.get('grade') or '').upper() in ('F', 'FF'):
            backlogs += 1
        s = m.get('semester') or 0
        g = sem_group.setdefault(s, [0.0, 0.0])
        g[0] += cr
        g[1] += cr * gp

    cgpa = round(weighted / total_cr, 2) if total_cr else 0.0
    sgpa = {str(s): round(v[1] / v[0], 2) if v[0] else 0.0 for s, v in sorted(sem_group.items())}
    total_lec = int(att[0] or 0)
    present = int(att[1] or 0)
    attendance_pct = round(present / total_lec * 100, 1) if total_lec else 0.0

    return {
        'student_id': sid,
        'cgpa': cgpa,
        'total_credits': round(total_cr, 1),
        'subjects_count': len(marks),
        'active_backlogs': backlogs,
        'sgpa_by_semester': sgpa,
        'attendance': {
            'total_lectures': total_lec,
            'present': present,
            'percentage': attendance_pct,
            'shortage_subjects': int(att[2] or 0),
            'status': 'good' if attendance_pct >= 75 else 'shortage',
        },
        'standing': 'distinction' if cgpa >= 8.5 else 'first_class' if cgpa >= 7 else 'pass' if cgpa >= 5 else 'at_risk',
    }


def grade_distribution(student_id):
    sid = resolve_student_id(student_id)
    if not sid:
        return None
    with connection.cursor() as cur:
        cur.execute("""
            SELECT UPPER(COALESCE(grade,'NA')) AS grade, COUNT(*) AS n
            FROM marks WHERE CAST(student_id AS TEXT)=%s
            GROUP BY UPPER(COALESCE(grade,'NA')) ORDER BY grade
        """, [sid])
        rows = _dictfetchall(cur)
    total = sum(r['n'] for r in rows) or 1
    return {
        'student_id': sid,
        'distribution': [
            {'grade': r['grade'], 'count': r['n'], 'percentage': round(r['n'] / total * 100, 1)}
            for r in rows
        ],
        'total': total,
    }


# ──────────────────────────────────────────────────────────────────────────
# Fee roll-ups
# ──────────────────────────────────────────────────────────────────────────
def fee_summary(department_id=None):
    sql = """
        SELECT COALESCE(d.name,'—') AS department,
               COALESCE(SUM(fs.amount),0) AS billed,
               COALESCE(SUM(fp.amount_paid),0) AS paid,
               COUNT(DISTINCT fp.student_id) AS students
        FROM fee_payments fp
        LEFT JOIN fee_structures fs ON CAST(fs.fee_id AS TEXT)=CAST(fp.fee_structure_id AS TEXT)
        LEFT JOIN students s ON CAST(s.student_id AS TEXT)=CAST(fp.student_id AS TEXT)
        LEFT JOIN departments d ON CAST(d.department_id AS TEXT)=CAST(s.department_id AS TEXT)
        WHERE 1=1
    """
    args = []
    if department_id:
        sql += " AND CAST(s.department_id AS TEXT)=%s"
        args.append(str(department_id))
    sql += " GROUP BY d.name ORDER BY billed DESC"
    with connection.cursor() as cur:
        cur.execute(sql, args)
        rows = _dictfetchall(cur)
    for r in rows:
        r['billed'] = float(r['billed']); r['paid'] = float(r['paid'])
        r['pending'] = round(r['billed'] - r['paid'], 2)
        r['collection_rate'] = round(r['paid'] / r['billed'] * 100, 1) if r['billed'] else 0.0
    totals = {
        'billed': round(sum(r['billed'] for r in rows), 2),
        'paid': round(sum(r['paid'] for r in rows), 2),
        'pending': round(sum(r['pending'] for r in rows), 2),
    }
    totals['collection_rate'] = round(totals['paid'] / totals['billed'] * 100, 1) if totals['billed'] else 0.0
    return {'by_department': rows, 'totals': totals}


# ──────────────────────────────────────────────────────────────────────────
# Institute dashboard aggregates
# ──────────────────────────────────────────────────────────────────────────
def institute_dashboard():
    with connection.cursor() as cur:
        cur.execute("""
            SELECT
              (SELECT COUNT(*) FROM students) AS students,
              (SELECT COUNT(*) FROM faculty) AS faculty,
              (SELECT COUNT(*) FROM departments) AS departments,
              (SELECT COUNT(*) FROM subjects) AS subjects,
              (SELECT ROUND(AVG(percentage)::numeric,1) FROM attendance_summary) AS avg_attendance,
              (SELECT ROUND(AVG(grade_points)::numeric,2) FROM marks) AS avg_gpa,
              (SELECT COUNT(*) FROM attendance_summary WHERE is_shortage) AS shortage_records
        """)
        row = _dictfetchall(cur)[0]
    for k in ('avg_attendance', 'avg_gpa'):
        row[k] = float(row[k] or 0)
    return row


def attendance_overview(department_id=None):
    sql = """
        SELECT sub.code, sub.name,
               ROUND(AVG(a.percentage)::numeric,1) AS avg_pct,
               COUNT(*) AS students,
               COUNT(*) FILTER (WHERE a.is_shortage) AS shortages
        FROM attendance_summary a
        LEFT JOIN subjects sub ON CAST(sub.subject_id AS TEXT)=CAST(a.subject_id AS TEXT)
        WHERE 1=1
    """
    args = []
    if department_id:
        sql += " AND CAST(sub.department_id AS TEXT)=%s"
        args.append(str(department_id))
    sql += " GROUP BY sub.code, sub.name ORDER BY avg_pct ASC NULLS LAST"
    with connection.cursor() as cur:
        cur.execute(sql, args)
        rows = _dictfetchall(cur)
    for r in rows:
        r['avg_pct'] = float(r['avg_pct'] or 0)
    return {'subjects': rows}
