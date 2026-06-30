from django.db import models
from courses.models import Course
from faculty.models import Faculty


class Schedule(models.Model):
    DAY_CHOICES = [
        ('monday', 'Monday'), ('tuesday', 'Tuesday'), ('wednesday', 'Wednesday'),
        ('thursday', 'Thursday'), ('friday', 'Friday'), ('saturday', 'Saturday'),
    ]
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='schedules')
    faculty = models.ForeignKey(Faculty, on_delete=models.SET_NULL, null=True, related_name='schedules')
    day = models.CharField(max_length=10, choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.course} - {self.day} {self.start_time}"
