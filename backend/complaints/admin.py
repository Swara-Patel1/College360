from django.contrib import admin
from .models import Complaint

@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'student', 'category', 'status', 'is_anonymous', 'created_at']
    list_filter = ['status', 'category', 'is_anonymous']
    search_fields = ['title', 'description', 'student__student_id', 'student__user__first_name']
