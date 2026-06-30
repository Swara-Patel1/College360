from django.db import models
from students.models import Student
from courses.models import Course


class Grade(models.Model):
    GRADE_CHOICES = [
        ('O', 'Outstanding'), ('A+', 'Excellent'), ('A', 'Very Good'),
        ('B+', 'Good'), ('B', 'Above Average'), ('C', 'Average'),
        ('D', 'Pass'), ('F', 'Fail'),
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='grades')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='grades')
    exam_type = models.CharField(max_length=50, default='Final')
    marks_obtained = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_marks = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    grade = models.CharField(max_length=2, choices=GRADE_CHOICES, blank=True)
    remarks = models.CharField(max_length=200, blank=True)
    graded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    exam_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'course', 'exam_type')

    @property
    def percentage(self):
        if self.total_marks > 0:
            return round((self.marks_obtained / self.total_marks) * 100, 2)
        return 0

    def save(self, *args, **kwargs):
        pct = self.percentage
        if pct >= 90: self.grade = 'O'
        elif pct >= 85: self.grade = 'A+'
        elif pct >= 75: self.grade = 'A'
        elif pct >= 65: self.grade = 'B+'
        elif pct >= 55: self.grade = 'B'
        elif pct >= 45: self.grade = 'C'
        elif pct >= 35: self.grade = 'D'
        else: self.grade = 'F'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student} - {self.course} - {self.grade}"
