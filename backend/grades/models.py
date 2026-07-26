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



    # Single source of truth for grade/GPA thresholds (kept out of the React client).
    GRADE_POINTS = {'O': 10.0, 'A+': 9.0, 'A': 8.0, 'B+': 7.0, 'B': 6.0, 'C': 5.0, 'D': 4.0, 'F': 0.0}

    @property
    def percentage(self):
        # Cast to float so a freshly-assigned float doesn't clash with a DB Decimal.
        total = float(self.total_marks or 0)
        if total > 0:
            return round((float(self.marks_obtained) / total) * 100, 2)
        return 0

    @staticmethod
    def letter_for(pct):
        if pct >= 90: return 'O'
        elif pct >= 85: return 'A+'
        elif pct >= 75: return 'A'
        elif pct >= 65: return 'B+'
        elif pct >= 55: return 'B'
        elif pct >= 45: return 'C'
        elif pct >= 35: return 'D'
        return 'F'

    @property
    def grade_point(self):
        return self.GRADE_POINTS.get(self.grade or self.letter_for(self.percentage), 0.0)

    def save(self, *args, **kwargs):
        self.grade = self.letter_for(self.percentage)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student} - {self.course} - {self.grade}"
