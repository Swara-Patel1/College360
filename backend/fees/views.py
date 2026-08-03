from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.core.mail import send_mail, BadHeaderError
from django.conf import settings
from .models import Fee
from .serializers import FeeSerializer


class FeeViewSet(viewsets.ModelViewSet):
    queryset = Fee.objects.select_related('student__user').all()
    serializer_class = FeeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        student = self.request.query_params.get('student')
        status = self.request.query_params.get('status')
        fee_type = self.request.query_params.get('fee_type')
        if student: qs = qs.filter(student_id=student)
        if status: qs = qs.filter(status=status)
        if fee_type: qs = qs.filter(fee_type=fee_type)
        return qs

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        fee = self.get_object()
        fee.status = 'paid'
        fee.payment_date = request.data.get('payment_date')
        fee.payment_method = request.data.get('payment_method', 'cash')
        fee.transaction_id = request.data.get('transaction_id', '')
        fee.save()
        return Response(FeeSerializer(fee).data)

    @action(detail=False, methods=['post'], url_path='send-reminders')
    def send_reminders(self, request):
        """Sends email reminders for pending/overdue fees."""
        pending_fees = Fee.objects.select_related('student__user').filter(status__in=['pending', 'overdue'])
        sent_count = 0
        details = []

        for fee in pending_fees:
            user = fee.student.user
            email = user.email
            if email:
                subject = f"⚠️ Fee Payment Reminder: {fee.get_fee_type_display()} Due"
                message = f"Dear {user.get_full_name()},\n\nYour fee of ₹{fee.amount} ({fee.get_fee_type_display()}) is pending with due date {fee.due_date}.\n\nPlease clear your dues at the earliest.\n\nCollege Management"
                try:
                    send_mail(
                        subject,
                        message,
                        settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@college360.edu',
                        [email],
                        fail_silently=True
                    )
                    sent_count += 1
                    details.append({'student': user.get_full_name(), 'email': email, 'status': 'sent'})
                except Exception as e:
                    details.append({'student': user.get_full_name(), 'email': email, 'status': f'failed: {str(e)}'})

        return Response({
            'success': True,
            'total_pending': pending_fees.count(),
            'reminders_sent': sent_count,
            'details': details
        })

    @action(detail=False, methods=['post'], url_path='send-reminder')
    def send_reminder(self, request):
        """
        Send a targeted fee reminder email to a specific parent/student.
        Expected payload: { to_email, subject, body }
        Returns { success: true } or { success: false, error: "..." }
        """
        import threading
        import logging

        to_email = request.data.get('to_email', '').strip()
        subject  = request.data.get('subject', 'Fee Payment Reminder').strip()
        body     = request.data.get('body', '').strip()

        if not to_email:
            return Response({'success': False, 'error': 'Recipient email is required.'}, status=400)
        if not body:
            return Response({'success': False, 'error': 'Email body cannot be empty.'}, status=400)

        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'patelrushi042@gmail.com')

        def _do_send():
            try:
                send_mail(
                    subject,
                    body,
                    from_email,
                    [to_email],
                    fail_silently=False,
                )
            except Exception as e:
                logging.getLogger(__name__).warning(f"Failed background email to {to_email}: {e}")

        threading.Thread(target=_do_send, daemon=True).start()
        return Response({'success': True, 'message': f'Email dispatched to {to_email}'})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = Fee.objects.all()
        student = request.query_params.get('student')
        if student: qs = qs.filter(student_id=student)
        paid = sum(f.amount for f in qs.filter(status='paid'))
        pending = sum(f.amount for f in qs.filter(status='pending'))
        overdue = sum(f.amount for f in qs.filter(status='overdue'))
        return Response({'paid': paid, 'pending': pending, 'overdue': overdue,
                         'total': paid + pending + overdue})

