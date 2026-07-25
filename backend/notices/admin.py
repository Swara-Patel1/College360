from django.contrib import admin
from .models import Notice

@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ['title', 'notice_type', 'audience', 'posted_by', 'is_active', 'created_at']
    list_filter = ['notice_type', 'audience', 'is_active']
    search_fields = ['title', 'content']
