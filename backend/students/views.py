from rest_framework import viewsets
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
        status = self.request.query_params.get('status')
        search = self.request.query_params.get('search')
        if dept: qs = qs.filter(department_id=dept)
        if year: qs = qs.filter(year_of_study=year)
        if status: qs = qs.filter(status=status)
        if search:
            qs = qs.filter(
                user__first_name__icontains=search
            ) | qs.filter(user__last_name__icontains=search) | qs.filter(student_id__icontains=search)
        return qs

    @action(detail=False, methods=['get'])
    def my_profile(self, request):
        try:
            student = Student.objects.get(user=request.user)
            return Response(StudentSerializer(student).data)
        except Student.DoesNotExist:
            return Response({'error': 'Student profile not found'}, status=404)
