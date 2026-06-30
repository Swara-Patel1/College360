from rest_framework import serializers
from .models import Complaint


class ComplaintSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_no = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = '__all__'
        read_only_fields = ['student', 'created_at', 'updated_at']

    def get_student_name(self, obj):
        if obj.is_anonymous:
            return 'Anonymous'
        u = obj.student.user
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_student_id_no(self, obj):
        if obj.is_anonymous:
            return ''
        return obj.student.student_id or ''
