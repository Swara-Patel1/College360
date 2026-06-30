from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Grade
from .serializers import GradeSerializer


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.select_related('student__user', 'course').all()
    serializer_class = GradeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        student = self.request.query_params.get('student')
        course = self.request.query_params.get('course')
        if student: qs = qs.filter(student_id=student)
        if course: qs = qs.filter(course_id=course)
        return qs

    def perform_create(self, serializer):
        serializer.save(graded_by=self.request.user)

    @action(detail=False, methods=['get'])
    def my_grades(self, request):
        """Returns grades for the currently logged-in student."""
        try:
            from students.models import Student
            student = Student.objects.get(user=request.user)
            grades = Grade.objects.select_related('course').filter(student=student)
            return Response(GradeSerializer(grades, many=True).data)
        except Student.DoesNotExist:
            return Response({'error': 'Student profile not found'}, status=404)
