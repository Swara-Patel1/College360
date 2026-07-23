from rest_framework import serializers
from .models import Fee


class FeeSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id_display = serializers.CharField(source='student.student_id', read_only=True)
    student_email = serializers.CharField(source='student.user.email', read_only=True)
    amount_paid = serializers.SerializerMethodField()

    class Meta:
        model = Fee
        fields = [
            'id', 'student', 'student_name', 'student_id_display', 'student_email',
            'fee_type', 'amount', 'amount_paid', 'due_date', 'status',
            'payment_date', 'payment_method', 'transaction_id', 'remarks',
            'academic_year', 'semester', 'created_at',
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name() or obj.student.user.email

    def get_amount_paid(self, obj):
        # amount_paid = amount if paid, else 0
        return float(obj.amount) if obj.status == 'paid' else 0.0
