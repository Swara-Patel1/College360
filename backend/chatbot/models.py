"""
Chatbot Models — ChatSession & ChatMessage
Stores conversation history per student for the LJU Student Assistant.
"""
from django.db import models
from accounts.models import User


class ChatSession(models.Model):
    """
    Represents a single chat conversation thread for a student.
    Each student can have multiple sessions (like separate chat threads).
    """
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        limit_choices_to={'role': 'student'},
        help_text='The student who owns this chat session'
    )
    title = models.CharField(
        max_length=200,
        default='New Conversation',
        help_text='Auto-generated title from the first message'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Chat Session'
        verbose_name_plural = 'Chat Sessions'

    def __str__(self):
        return f"Session #{self.id} — {self.student.get_full_name()} — {self.title}"


class ChatMessage(models.Model):
    """
    Individual message within a chat session.
    Sender is either 'student' (user) or 'assistant' (AI).
    """
    SENDER_CHOICES = [
        ('student', 'Student'),
        ('assistant', 'Assistant'),
    ]

    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
        help_text='The chat session this message belongs to'
    )
    sender = models.CharField(
        max_length=10,
        choices=SENDER_CHOICES,
        help_text='Who sent this message'
    )
    message = models.TextField(
        help_text='The message content'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Chat Message'
        verbose_name_plural = 'Chat Messages'

    def __str__(self):
        preview = self.message[:50] + '...' if len(self.message) > 50 else self.message
        return f"[{self.sender}] {preview}"
