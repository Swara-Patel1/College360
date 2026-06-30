from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Notice
from .serializers import NoticeSerializer


class NoticeViewSet(viewsets.ModelViewSet):
    queryset = Notice.objects.select_related('posted_by').all()
    serializer_class = NoticeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset().filter(is_active=True)
        notice_type = self.request.query_params.get('type')
        audience = self.request.query_params.get('audience')
        if notice_type: qs = qs.filter(notice_type=notice_type)
        if audience: qs = qs.filter(audience__in=[audience, 'all'])
        return qs

    def perform_create(self, serializer):
        serializer.save(posted_by=self.request.user)
