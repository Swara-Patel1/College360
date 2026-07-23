from django.db import models
from students.models import Student


class Fee(models.Model):
    FEE_TYPE_CHOICES = [
        ('tuition', 'Tuition Fee'),
        ('exam', 'Exam Fee'),
        ('library', 'Library Fee'),
        ('sports', 'Sports Fee'),
        ('hostel', 'Hostel Fee'),
        ('transport', 'Transport Fee'),
        ('misc', 'Miscellaneous'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
        ('waived', 'Waived'),
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fees')
    fee_type = models.CharField(max_length=20, choices=FEE_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    payment_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True)
    remarks = models.CharField(max_length=200, blank=True)
    academic_year = models.CharField(max_length=10, default='2024-25')
    semester = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['student', 'status'], name='idx_fee_student_status'),
            models.Index(fields=['due_date'], name='idx_fee_due_date'),
        ]

    def __str__(self):
        return f"{self.student} - {self.fee_type} - {self.status}"
