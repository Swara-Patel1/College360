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
        """Returns the student profile for the currently logged-in user."""
        try:
            student = Student.objects.select_related(
                'user', 'department'
            ).get(user=request.user)
            data = StudentSerializer(student).data
            # Add extra fields expected by the frontend
            data['department_name'] = student.department.name if student.department else '—'
            data['email'] = student.user.email
            data['year_of_study'] = student.year_of_study
            data['status'] = student.status or ('active' if student.user.is_active else 'inactive')
            return Response(data)
        except Student.DoesNotExist:
            return Response({'error': 'Student profile not found'}, status=404)
