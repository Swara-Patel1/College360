from django.contrib import admin
from .models import Fee, PaymentTransaction

@admin.register(Fee)
class FeeAdmin(admin.ModelAdmin):
    list_display = ['student', 'fee_type', 'amount', 'due_date', 'status', 'payment_date']
    list_filter = ['status', 'fee_type', 'academic_year']
    search_fields = ['student__student_id', 'student__user__first_name', 'transaction_id']

@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ['order_id', 'fee', 'student', 'amount', 'status', 'created_at']
    list_filter = ['status', 'gateway', 'method']
    search_fields = ['order_id', 'payment_id', 'student__student_id']
