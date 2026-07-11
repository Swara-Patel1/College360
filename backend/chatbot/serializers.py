"""
Chatbot Serializers — DRF serializers for chat API endpoints.
"""
from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializes individual chat messages."""

    class Meta:
        model = ChatMessage
        fields = ['id', 'sender', 'message', 'created_at']
        read_only_fields = ['id', 'created_at']


class ChatSessionSerializer(serializers.ModelSerializer):
    """
    Serializes chat sessions with a preview of the last message
    and total message count.
    """
    last_message = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'created_at', 'updated_at', 'last_message', 'message_count']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_last_message(self, obj):
        """Returns a preview of the most recent message in the session."""
        last_msg = obj.messages.order_by('-created_at').first()
        if last_msg:
            preview = last_msg.message[:80] + '...' if len(last_msg.message) > 80 else last_msg.message
            return {
                'sender': last_msg.sender,
                'preview': preview,
                'created_at': last_msg.created_at
            }
        return None

    def get_message_count(self, obj):
        """Returns total number of messages in the session."""
        return obj.messages.count()


class ChatSessionDetailSerializer(serializers.ModelSerializer):
    """Serializes a full chat session with all messages."""
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChatInputSerializer(serializers.Serializer):
    """Validates incoming chat request from the frontend."""
    message = serializers.CharField(
        max_length=2000,
        help_text='The user message to send to the AI assistant'
    )
    session_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text='Optional session ID to continue an existing conversation'
    )

    def validate_message(self, value):
        """Ensure message is not empty or only whitespace."""
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('Message cannot be empty.')
        if len(cleaned) < 2:
            raise serializers.ValidationError('Message is too short.')
        return cleaned
