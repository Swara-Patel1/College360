from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Course, Enrollment
from .serializers import CourseSerializer, EnrollmentSerializer


class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.select_related('department', 'faculty__user').all()
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get('department')
        sem = self.request.query_params.get('semester')
        if dept: qs = qs.filter(department_id=dept)
        if sem: qs = qs.filter(semester=sem)
        return qs


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.select_related('student__user', 'course').all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        student = self.request.query_params.get('student')
        course = self.request.query_params.get('course')
        if student: qs = qs.filter(student_id=student)
        if course: qs = qs.filter(course_id=course)
        return qs
