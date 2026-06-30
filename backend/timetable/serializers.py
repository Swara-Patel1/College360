from rest_framework import serializers
from .models import Schedule


class ScheduleSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    faculty_name = serializers.CharField(source='faculty.user.get_full_name', read_only=True)

    class Meta:
        model = Schedule
        fields = '__all__'
