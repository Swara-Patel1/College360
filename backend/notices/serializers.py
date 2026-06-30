from rest_framework import serializers
from .models import Notice
from accounts.serializers import UserSerializer


class NoticeSerializer(serializers.ModelSerializer):
    posted_by_name = serializers.CharField(source='posted_by.get_full_name', read_only=True)

    class Meta:
        model = Notice
        fields = '__all__'
