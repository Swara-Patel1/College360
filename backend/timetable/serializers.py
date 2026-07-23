from rest_framework import serializers
from .models import Schedule


class ScheduleSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    faculty_name = serializers.SerializerMethodField()
    # Frontend uses 'day' and 'room' fields
    day_of_week = serializers.CharField(source='day', read_only=True)

    class Meta:
        model = Schedule
        fields = [
            'id', 'course', 'course_name', 'course_code',
            'faculty', 'faculty_name',
            'day', 'day_of_week', 'start_time', 'end_time', 'room',
            'is_active', 'created_at',
        ]

    def get_faculty_name(self, obj):
        if obj.faculty:
            return obj.faculty.user.get_full_name() or obj.faculty.user.email
        return '—'
