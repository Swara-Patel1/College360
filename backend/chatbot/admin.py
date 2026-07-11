from django.contrib import admin
from .models import ChatSession, ChatMessage


class ChatMessageInline(admin.TabularInline):
    """Inline display of messages within a session in the admin panel."""
    model = ChatMessage
    extra = 0
    readonly_fields = ['sender', 'message', 'created_at']
    ordering = ['created_at']


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'student', 'title', 'message_count', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['student__first_name', 'student__last_name', 'student__email', 'title']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [ChatMessageInline]

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Messages'


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'sender', 'short_message', 'created_at']
    list_filter = ['sender', 'created_at']
    search_fields = ['message']
    readonly_fields = ['created_at']

    def short_message(self, obj):
        return obj.message[:80] + '...' if len(obj.message) > 80 else obj.message
    short_message.short_description = 'Message'
