from django.contrib import admin
from .models import AttendanceRecord

@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['student', 'course', 'date', 'status', 'marked_by']
    list_filter = ['status', 'date', 'course']
    search_fields = ['student__student_id', 'student__user__first_name', 'course__code']
