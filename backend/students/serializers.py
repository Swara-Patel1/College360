from rest_framework import serializers
from .models import Student
from accounts.serializers import UserSerializer


class StudentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    full_name = serializers.SerializerMethodField()
    email = serializers.CharField(source='user.email', read_only=True)
    year_of_study = serializers.IntegerField(read_only=True)
    # Frontend uses 'roll_number' but model has it as 'roll_number' already
    # Expose 'id' as student_id for compatibility
    id = serializers.CharField(source='student_id', read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'student_id', 'user', 'department', 'department_name',
            'roll_number', 'gender', 'blood_group', 'year_of_study',
            'semester', 'admission_date', 'guardian_name', 'guardian_phone',
            'status', 'created_at', 'full_name', 'email',
        ]

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email
