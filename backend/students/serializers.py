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
    enrollment_no = serializers.SerializerMethodField()
    parent_email  = serializers.SerializerMethodField()
    parent_phone  = serializers.SerializerMethodField()
    date_of_birth = serializers.SerializerMethodField()
    attendance_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'student_id', 'user', 'department', 'department_name',
            'roll_number', 'enrollment_no', 'gender', 'blood_group', 'year_of_study',
            'semester', 'admission_date', 'date_of_birth',
            'guardian_name', 'guardian_phone', 'parent_email', 'parent_phone',
            'status', 'created_at', 'full_name', 'email',
            'attendance_percentage',
        ]

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email

    def _raw_student(self, obj):
        """Fetch extra fields from the raw 'students' table (PostgreSQL) by user_id."""
        from django.db import connection
        cache = getattr(obj, '_raw_cache', None)
        if cache is not None:
            return cache
        try:
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT enrollment_no, parent_email, parent_phone, date_of_birth "
                    "FROM students WHERE CAST(user_id AS TEXT) = %s LIMIT 1",
                    [str(obj.user.id)]
                )
                row = cur.fetchone()
                result = {'enrollment_no': '', 'parent_email': '', 'parent_phone': '', 'date_of_birth': None}
                if row:
                    result['enrollment_no'] = row[0] or ''
                    result['parent_email']   = row[1] or ''
                    result['parent_phone']   = row[2] or ''
                    result['date_of_birth']  = row[3]
                obj._raw_cache = result
                return result
        except Exception:
            return {'enrollment_no': '', 'parent_email': '', 'parent_phone': '', 'date_of_birth': None}

    def get_enrollment_no(self, obj):
        return self._raw_student(obj).get('enrollment_no', '') or obj.student_id

    def get_parent_email(self, obj):
        return self._raw_student(obj).get('parent_email', '')

    def get_parent_phone(self, obj):
        return self._raw_student(obj).get('parent_phone', '') or obj.guardian_phone

    def get_date_of_birth(self, obj):
        val = self._raw_student(obj).get('date_of_birth')
        if val:
            return val.isoformat() if hasattr(val, 'isoformat') else str(val)
        return None

    def get_attendance_percentage(self, obj):
        """Return attendance_percentage from attendance_summary if available."""
        from django.db import connection
        try:
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT overall_percentage FROM attendance_summary WHERE student_id = %s LIMIT 1",
                    [str(obj.student_id)]
                )
                row = cur.fetchone()
                if row and row[0] is not None:
                    return round(float(row[0]), 1)
        except Exception:
            pass
        return None
