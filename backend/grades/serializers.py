from rest_framework import serializers
from .models import Grade


class GradeSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    course_name = serializers.CharField(source='course.name', read_only=True)
    course_code = serializers.CharField(source='course.code', read_only=True)
    percentage = serializers.ReadOnlyField()
    # Frontend uses mark_id
    mark_id = serializers.IntegerField(source='pk', read_only=True)
    id = serializers.IntegerField(source='pk', read_only=True)
    # Frontend references course/student by their PKs
    course_id = serializers.IntegerField(source='course.pk', read_only=True)
    student_id = serializers.CharField(source='student.student_id', read_only=True)

    class Meta:
        model = Grade
        fields = [
            'id', 'mark_id', 'student', 'student_id', 'student_name',
            'course', 'course_id', 'course_name', 'course_code',
            'exam_type', 'marks_obtained', 'total_marks', 'grade',
            'percentage', 'remarks', 'exam_date', 'created_at', 'updated_at',
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name() or obj.student.user.email
