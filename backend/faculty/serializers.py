from rest_framework import serializers
from .models import Faculty, Department
from accounts.serializers import UserSerializer


class DepartmentSerializer(serializers.ModelSerializer):
    faculty_count = serializers.SerializerMethodField()
    class Meta:
        model = Department
        fields = '__all__'

    def get_faculty_count(self, obj):
        return obj.faculty.count()


class FacultySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('accounts').models.User.objects.all(),
        source='user', write_only=True
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), source='department', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Faculty
        fields = '__all__'
