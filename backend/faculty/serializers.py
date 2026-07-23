from rest_framework import serializers
from .models import Faculty, Department
from accounts.serializers import UserSerializer


class DepartmentSerializer(serializers.ModelSerializer):
    faculty_count = serializers.SerializerMethodField()
    # Alias 'id' field for frontend compatibility
    id = serializers.IntegerField(source='pk', read_only=True)

    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'description', 'created_at', 'faculty_count']

    def get_faculty_count(self, obj):
        return obj.faculty.count()


class FacultySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    full_name = serializers.SerializerMethodField()
    # id alias for frontend
    id = serializers.CharField(source='faculty_id', read_only=True)

    # Write-only fields for creating
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('accounts').models.User.objects.all(),
        source='user', write_only=True, required=False
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), source='department',
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Faculty
        fields = [
            'id', 'faculty_id', 'user', 'department', 'department_name',
            'designation', 'qualification', 'experience_years', 'specialization',
            'joining_date', 'salary', 'is_active', 'created_at',
            'email', 'full_name', 'user_id', 'department_id',
        ]

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email

    @property
    def status(self):
        return 'active' if self.is_active else 'inactive'
