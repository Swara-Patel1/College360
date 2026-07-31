from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Student
from .serializers import StudentSerializer


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related('user', 'department').all()
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get('department')
        year = self.request.query_params.get('year')
        status_q = self.request.query_params.get('status')
        search = self.request.query_params.get('search')
        if dept:
            qs = qs.filter(department_id=dept)
        if year:
            qs = qs.filter(year_of_study=year)
        if status_q:
            qs = qs.filter(status=status_q)
        if search:
            qs = qs.filter(
                user__first_name__icontains=search
            ) | qs.filter(
                user__last_name__icontains=search
            ) | qs.filter(
                student_id__icontains=search
            )
        return qs

    @action(detail=False, methods=['get'], url_path='my_profile')
    def my_profile(self, request):
        """Returns the student profile for the currently logged-in user.

        Reads from the `students` data table (the source the rest of the app uses)
        rather than the Django ORM table, which may be unpopulated. Matches on the
        user's email — the reliable key across the accounts and rest data models.
        """
        from django.db import connection
        email = (getattr(request.user, 'email', '') or '').strip()
        if not email:
            return Response({'error': 'Student profile not found'}, status=404)
        with connection.cursor() as cur:
            cur.execute("""
                SELECT s.student_id, s.user_id, s.enrollment_no, s.first_name, s.last_name,
                       s.department_id, d.name AS department_name,
                       sem.number AS semester_number, s.current_semester_id,
                       u.email, u.is_active
                FROM students s
                LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(s.user_id AS TEXT)
                LEFT JOIN departments d ON CAST(d.department_id AS TEXT) = CAST(s.department_id AS TEXT)
                LEFT JOIN semesters sem ON CAST(sem.semester_id AS TEXT) = CAST(s.current_semester_id AS TEXT)
                WHERE LOWER(u.email) = LOWER(%s)
                LIMIT 1
            """, [email])
            row = cur.fetchone()
            if not row:
                return Response({'error': 'Student profile not found'}, status=404)
            cols = [c[0] for c in cur.description]
            r = dict(zip(cols, row))

        sem = r.get('semester_number')
        year = ((int(sem) + 1) // 2) if sem else None
        return Response({
            'student_id': str(r['student_id']),
            'id': str(r['student_id']),
            'user_id': str(r['user_id']) if r.get('user_id') else None,
            'enrollment_no': r.get('enrollment_no'),
            'first_name': r.get('first_name'),
            'last_name': r.get('last_name'),
            'email': r.get('email') or email,
            'department_id': str(r['department_id']) if r.get('department_id') else None,
            'department_name': r.get('department_name') or '—',
            'semester': sem,
            'current_semester': sem,
            'year_of_study': year,
            'status': 'active' if r.get('is_active') else 'inactive',
        })
