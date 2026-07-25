from django.contrib import admin
from .models import Student

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ['student_id', 'user', 'department', 'year_of_study', 'semester', 'status']
    list_filter = ['department', 'year_of_study', 'semester', 'status']
    search_fields = ['student_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email']
