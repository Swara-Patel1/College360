from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Faculty, Department
from .serializers import FacultySerializer, DepartmentSerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]


class FacultyViewSet(viewsets.ModelViewSet):
    queryset = Faculty.objects.select_related('user', 'department').all()
    serializer_class = FacultySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get('department')
        if dept:
            qs = qs.filter(department_id=dept)
        return qs

    @action(detail=False, methods=['get'])
    def my_profile(self, request):
        try:
            faculty = Faculty.objects.get(user=request.user)
            return Response(FacultySerializer(faculty).data)
        except Faculty.DoesNotExist:
            return Response({'error': 'Faculty profile not found'}, status=404)
