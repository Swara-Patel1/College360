from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from .models import Schedule
from .serializers import ScheduleSerializer


class IsHODOrAdmin(BasePermission):
    """Custom permission: only HOD (designation=hod) or admin role can write."""

    def _is_writer(self, user):
        if not user or not user.is_authenticated:
            return False
        if user.role == 'admin':
            return True
        if user.role == 'faculty':
            try:
                return user.faculty_profile.designation == 'hod'
            except Exception:
                return False
        return False

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Read-only for everyone authenticated
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return self._is_writer(request.user)

    def has_object_permission(self, request, view, obj):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return self._is_writer(request.user)


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.select_related('course', 'faculty__user').all()
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated, IsHODOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        day = self.request.query_params.get('day')
        faculty_id = self.request.query_params.get('faculty')
        my_schedule = self.request.query_params.get('my_schedule')

        if day:
            qs = qs.filter(day=day)
        if faculty_id:
            qs = qs.filter(faculty_id=faculty_id)
        # Faculty requesting their own schedule
        if my_schedule and self.request.user.role == 'faculty':
            try:
                fac = self.request.user.faculty_profile
                qs = qs.filter(faculty=fac)
            except Exception:
                qs = qs.none()
        return qs

    @action(detail=False, methods=['get'], url_path='my_schedule')
    def my_schedule(self, request):
        """Returns schedules assigned to the currently logged-in faculty."""
        if request.user.role != 'faculty':
            return Response({'error': 'Only faculty can access this endpoint.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            fac = request.user.faculty_profile
        except Exception:
            return Response([], status=status.HTTP_200_OK)
        day = request.query_params.get('day')
        qs = Schedule.objects.select_related('course', 'faculty__user').filter(faculty=fac)
        if day:
            qs = qs.filter(day=day)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def check_hod_permission(self, request):
        """Utility to verify write access."""
        if request.user.role == 'admin':
            return True
        if request.user.role == 'faculty':
            try:
                return request.user.faculty_profile.designation == 'hod'
            except Exception:
                return False
        return False

    def create(self, request, *args, **kwargs):
        if not self.check_hod_permission(request):
            return Response({'error': 'Only HOD or Admin can create timetable entries.'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not self.check_hod_permission(request):
            return Response({'error': 'Only HOD or Admin can modify timetable entries.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self.check_hod_permission(request):
            return Response({'error': 'Only HOD or Admin can modify timetable entries.'}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self.check_hod_permission(request):
            return Response({'error': 'Only HOD or Admin can delete timetable entries.'}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
