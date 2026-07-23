from rest_framework import serializers
from .models import AttendanceRecord


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    marked_by_name = serializers.SerializerMethodField()
    student_id_no = serializers.CharField(source='student.student_id', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'student', 'student_id_no', 'student_name',
            'course', 'course_name', 'course_code',
            'date', 'status', 'remarks',
            'marked_by', 'marked_by_name', 'created_at',
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name() or obj.student.user.email

    def get_marked_by_name(self, obj):
        if obj.marked_by:
            return obj.marked_by.get_full_name() or obj.marked_by.email
        return None
