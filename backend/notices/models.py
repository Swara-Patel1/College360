from django.db import models
from accounts.models import User


class Notice(models.Model):
    TYPE_CHOICES = [
        ('general', 'General'),
        ('exam', 'Exam'),
        ('holiday', 'Holiday'),
        ('event', 'Event'),
        ('urgent', 'Urgent'),
    ]
    AUDIENCE_CHOICES = [
        ('all', 'All'),
        ('students', 'Students Only'),
        ('faculty', 'Faculty Only'),
    ]
    title = models.CharField(max_length=200)
    content = models.TextField()
    notice_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='general')
    audience = models.CharField(max_length=10, choices=AUDIENCE_CHOICES, default='all')
    posted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    is_active = models.BooleanField(default=True)
    attachment = models.FileField(upload_to='notices/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
