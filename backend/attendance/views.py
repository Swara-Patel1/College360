from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q
from .models import AttendanceRecord
from .serializers import AttendanceSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related('student__user', 'course').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        student = self.request.query_params.get('student')
        course = self.request.query_params.get('course')
        date = self.request.query_params.get('date')
        if student: qs = qs.filter(student_id=student)
        if course: qs = qs.filter(course_id=course)
        if date: qs = qs.filter(date=date)
        return qs

    def perform_create(self, serializer):
        serializer.save(marked_by=self.request.user)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        student_id = request.query_params.get('student')
        course_id = request.query_params.get('course')
        qs = AttendanceRecord.objects.all()
        if student_id: qs = qs.filter(student_id=student_id)
        if course_id: qs = qs.filter(course_id=course_id)
        total = qs.count()
        present = qs.filter(status='present').count()
        absent = qs.filter(status='absent').count()
        late = qs.filter(status='late').count()
        percentage = round((present / total * 100), 2) if total > 0 else 0
        return Response({
            'total': total, 'present': present,
            'absent': absent, 'late': late,
            'percentage': percentage
        })

    @action(detail=False, methods=['post'])
    def bulk_mark(self, request):
        records = request.data.get('records', [])
        created = []
        for r in records:
            obj, _ = AttendanceRecord.objects.update_or_create(
                student_id=r['student'], course_id=r['course'], date=r['date'],
                defaults={'status': r.get('status', 'present'), 'marked_by': request.user}
            )
            created.append(AttendanceSerializer(obj).data)
        return Response({'marked': len(created), 'records': created})
