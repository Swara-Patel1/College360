from rest_framework import serializers
from .models import Fee


class FeeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)

    class Meta:
        model = Fee
        fields = '__all__'
