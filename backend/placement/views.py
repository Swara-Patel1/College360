"""
Placement-prediction API (DRF).

Endpoints (mounted under /api/placement/):
  POST /predict/            → readiness prediction from manual feature input
  GET  /me/                 → readiness for the logged-in student (real data)
  GET  /student/<id>/       → readiness for a specific student (staff)
  GET  /leaderboard/        → ranked placement readiness across students
  GET  /model-info/         → active model, metrics and available algorithms
  POST /retrain/            → (re)train a model and return its metrics (staff)
"""
from django.db import connection

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from . import ml
from . import service
from .serializers import PredictInputSerializer, RetrainInputSerializer


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────
def _resolve_student_id(request):
    """Map the authenticated user to a students.student_id via email/user_id."""
    email = (getattr(request.user, 'email', '') or '').strip()
    uid = str(getattr(request.user, 'pk', '') or '')
    with connection.cursor() as cur:
        cur.execute("""
            SELECT CAST(s.student_id AS TEXT)
            FROM students s
            LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
            WHERE LOWER(u.email) = LOWER(%s)
               OR CAST(s.user_id AS TEXT) = %s
               OR CAST(s.student_id AS TEXT) = %s
            LIMIT 1
        """, [email, uid, uid])
        row = cur.fetchone()
    return row[0] if row else None


def _is_staff(request):
    roles = (getattr(request.user, 'roles', '') or getattr(request.user, 'role', '') or '').lower()
    return any(r in roles for r in ('admin', 'faculty', 'hod')) or bool(getattr(request.user, 'is_staff', False))


# ──────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def predict(request):
    """Predict placement readiness from manually supplied features."""
    ser = PredictInputSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    v = ser.validated_data
    prob = ml.predict_probability(v['cpi'], v['attendance'], v['backlogs'], v['extra'], v['model_type'])
    category = ml.predict_category(v['cpi'], v['attendance'], v['backlogs'], v['extra'], v['model_type'])
    return Response({
        'input': {k: v[k] for k in ('cpi', 'attendance', 'backlogs', 'extra')},
        'placement_probability': round(prob, 4),
        'readiness_score': round(prob * 100, 1),
        'category': category,
        'model': v['model_type'],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_readiness(request):
    """Compute placement readiness for the logged-in student from real data."""
    sid = _resolve_student_id(request)
    if not sid:
        return Response({'error': 'No student profile linked to this account.'},
                        status=status.HTTP_404_NOT_FOUND)
    return Response(service.compute_placement(sid))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_readiness(request, student_id):
    """Compute placement readiness for a specific student (staff only)."""
    if not _is_staff(request) and _resolve_student_id(request) != str(student_id):
        return Response({'error': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    return Response(service.compute_placement(str(student_id)))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    """Rank students by computed placement readiness.

    Optional query params: department_id, limit (default 20).
    """
    dept = request.query_params.get('department_id', '').replace('eq.', '')
    try:
        limit = min(int(request.query_params.get('limit', 20)), 100)
    except (TypeError, ValueError):
        limit = 20

    sql = """
        SELECT CAST(s.student_id AS TEXT), s.first_name, s.last_name, s.enrollment_no,
               d.name AS dept_name
        FROM students s
        LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
        WHERE 1=1
    """
    args = []
    if dept:
        sql += " AND CAST(s.department_id AS TEXT) = %s"
        args.append(dept)
    sql += " ORDER BY s.enrollment_no LIMIT %s"
    args.append(limit * 3)  # over-fetch, then rank by computed score

    with connection.cursor() as cur:
        cur.execute(sql, args)
        rows = cur.fetchall()

    ranked = []
    for sid, fn, ln, enr, dname in rows:
        r = service.compute_placement(sid)
        if r.get('category') == 'insufficient':
            continue
        ranked.append({
            'student_id': sid,
            'name': f"{fn or ''} {ln or ''}".strip() or (enr or 'Student'),
            'enrollment_no': enr,
            'department': dname or '—',
            'readiness_score': r['total_score'],
            'category': r['category'],
            'cpi': r['cpi'],
            'attendance_pct': r['attendance_pct'],
        })
    ranked.sort(key=lambda x: x['readiness_score'], reverse=True)
    for i, row in enumerate(ranked[:limit], start=1):
        row['rank'] = i
    return Response(ranked[:limit])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def model_info(request):
    """Return active model metrics and the list of available algorithms."""
    model_type = request.query_params.get('model_type')
    return Response({
        'models': ml.list_models(),
        'metrics': ml.get_metrics(model_type),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def retrain(request):
    """(Re)train a model and return its evaluation metrics (staff only)."""
    if not _is_staff(request):
        return Response({'error': 'Only staff can retrain the model.'},
                        status=status.HTTP_403_FORBIDDEN)
    ser = RetrainInputSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
    _, metrics = ml.train(ser.validated_data['model_type'], persist=True)
    # make the freshly trained model the active one
    ml.get_model(ser.validated_data['model_type'])
    return Response({'message': 'Model trained.', 'metrics': metrics})
