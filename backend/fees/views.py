from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
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
