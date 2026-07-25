from django.contrib import admin
from .models import Course, Enrollment

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'department', 'faculty', 'credits', 'semester', 'is_active']
    list_filter = ['department', 'semester', 'is_active']
    search_fields = ['code', 'name']

@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'course', 'enrolled_date', 'is_active']
    list_filter = ['is_active', 'course']
