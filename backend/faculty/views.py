from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Faculty, Department
from .serializers import FacultySerializer, DepartmentSerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all().order_by('name')
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]


class FacultyViewSet(viewsets.ModelViewSet):
    queryset = Faculty.objects.select_related('user', 'department').all()
    serializer_class = FacultySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get('department')
        search = self.request.query_params.get('search')
        if dept:
            qs = qs.filter(department_id=dept)
        if search:
            qs = qs.filter(
                user__first_name__icontains=search
            ) | qs.filter(
                user__last_name__icontains=search
            ) | qs.filter(
                faculty_id__icontains=search
            )
        return qs

    @action(detail=False, methods=['get'], url_path='my_profile')
    def my_profile(self, request):
        """Returns the faculty profile for the currently logged-in user."""
        try:
            faculty = Faculty.objects.select_related('user', 'department').get(user=request.user)
            data = FacultySerializer(faculty).data
            data['department_name'] = faculty.department.name if faculty.department else '—'
            data['email'] = faculty.user.email
            data['status'] = 'active' if faculty.is_active else 'inactive'
            return Response(data)
        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty profile not found'}, status=404)

    @action(detail=False, methods=['get'], url_path='semesters')
    def semesters(self, request):
        """Returns available semesters (1-8) in the format the frontend expects."""
        semesters = [
            {'id': i, 'semester_id': f'sem-{i:02d}', 'name': f'Semester {i}', 'number': i}
            for i in range(1, 9)
        ]
        return Response(semesters)
