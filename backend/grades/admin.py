from django.contrib import admin
from .models import Grade

@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ['student', 'course', 'exam_type', 'marks_obtained', 'total_marks', 'grade']
    list_filter = ['grade', 'exam_type', 'course']
    search_fields = ['student__student_id', 'student__user__first_name', 'course__code']
