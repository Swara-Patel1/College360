from django.contrib import admin
from .models import Faculty, Department

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'code']

@admin.register(Faculty)
class FacultyAdmin(admin.ModelAdmin):
    list_display = ['faculty_id', 'user', 'department', 'designation', 'is_active']
    list_filter = ['department', 'designation', 'is_active']
