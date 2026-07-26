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


class PaymentTransaction(models.Model):
    """A payment-gateway transaction for a fee (Razorpay-style order → verify handshake)."""
    STATUS_CHOICES = [
        ('created', 'Created'),   # order created, awaiting payment
        ('paid', 'Paid'),         # payment captured & signature verified
        ('failed', 'Failed'),     # payment failed / cancelled
    ]
    METHOD_CHOICES = [
        ('card', 'Card'), ('upi', 'UPI'), ('netbanking', 'Net Banking'), ('wallet', 'Wallet'),
    ]
    fee = models.ForeignKey(Fee, on_delete=models.CASCADE, related_name='transactions')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='payment_transactions')
    gateway = models.CharField(max_length=20, default='razorpay')
    order_id = models.CharField(max_length=64, unique=True)
    payment_id = models.CharField(max_length=64, blank=True)
    signature = models.CharField(max_length=128, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=6, default='INR')
    method = models.CharField(max_length=12, choices=METHOD_CHOICES, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='created')
    receipt = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.gateway}:{self.order_id} ({self.status})"
