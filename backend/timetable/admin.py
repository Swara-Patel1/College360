from django.contrib import admin
from .models import Schedule

@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ['course', 'faculty', 'day', 'start_time', 'end_time', 'room', 'is_active']
    list_filter = ['day', 'is_active', 'course']
    search_fields = ['course__code', 'course__name', 'room']
