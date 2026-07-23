from rest_framework import serializers
from .models import Notice
from accounts.serializers import UserSerializer


class NoticeSerializer(serializers.ModelSerializer):
    posted_by_name = serializers.SerializerMethodField()
    posted_by_info = UserSerializer(source='posted_by', read_only=True)

    class Meta:
        model = Notice
        fields = [
            'id', 'title', 'content', 'notice_type', 'audience',
            'posted_by', 'posted_by_name', 'posted_by_info',
            'is_active', 'attachment', 'created_at', 'updated_at',
        ]

    def get_posted_by_name(self, obj):
        if obj.posted_by:
            return obj.posted_by.get_full_name() or obj.posted_by.email
        return 'Admin'
