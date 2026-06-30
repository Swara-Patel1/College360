from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Complaint
from .serializers import ComplaintSerializer


class ComplaintViewSet(viewsets.ModelViewSet):
    serializer_class = ComplaintSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'student':
            try:
                from students.models import Student
                student = Student.objects.get(user=user)
                return Complaint.objects.filter(student=student)
            except Exception:
                return Complaint.objects.none()
        # HOD and admin see all complaints
        return Complaint.objects.select_related('student__user').all()

    def perform_create(self, serializer):
        from students.models import Student
        student = Student.objects.get(user=self.request.user)
        serializer.save(student=student)

    @action(detail=True, methods=['patch', 'post'])
    def respond(self, request, pk=None):
        """HOD/Admin responds to a complaint."""
        user = request.user

        # Only faculty (including HOD) and admin can respond
        if user.role == 'student':
            return Response({'error': 'Students cannot respond to complaints.'}, status=403)

        try:
            complaint = self.get_object()
        except Exception:
            return Response({'error': 'Complaint not found.'}, status=404)

        if 'hod_response' in request.data:
            complaint.hod_response = request.data['hod_response']
        if 'status' in request.data:
            complaint.status = request.data['status']
        complaint.save()
        return Response(ComplaintSerializer(complaint).data)
