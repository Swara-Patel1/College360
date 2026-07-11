"""
Chatbot Views — DRF API endpoints for the LJU Student Assistant.
Handles sending messages, retrieving chat history, and clearing sessions.
All endpoints require JWT authentication and enforce student-only access.
"""
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .authentication import ChatBotAuthentication
from .models import ChatSession, ChatMessage
from .serializers import (
    ChatInputSerializer,
    ChatSessionSerializer,
    ChatSessionDetailSerializer,
    ChatMessageSerializer,
)
from .services.groq_service import get_groq_response
from .services.rag_service import build_rag_context

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Rate Limiting — 10 requests per minute for chat messages
# ──────────────────────────────────────────────────────────────
class ChatRateThrottle(UserRateThrottle):
    rate = '10/min'


def _ensure_student(request):
    """Helper to verify the user is a student. Returns error response or None."""
    if request.user.role != 'student':
        return Response(
            {'error': 'Only students can access the chatbot.'},
            status=status.HTTP_403_FORBIDDEN
        )
    return None


# ──────────────────────────────────────────────────────────────
# POST /api/chat/ — Send a message and get AI response
# ──────────────────────────────────────────────────────────────
@api_view(['POST'])
@authentication_classes([ChatBotAuthentication])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatRateThrottle])
def send_message(request):
    """
    Accepts a student message, retrieves RAG context, calls Groq,
    and returns the AI response. Creates a new session if needed.
    """
    # Verify student role
    err = _ensure_student(request)
    if err:
        return err

    # Validate input
    serializer = ChatInputSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user_message = serializer.validated_data['message']
    session_id = serializer.validated_data.get('session_id')

    try:
        # Get or create chat session
        if session_id:
            try:
                session = ChatSession.objects.get(id=session_id, student=request.user)
            except ChatSession.DoesNotExist:
                return Response(
                    {'error': 'Chat session not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Create a new session with a title derived from the first message
            title = user_message[:60] + '...' if len(user_message) > 60 else user_message
            session = ChatSession.objects.create(
                student=request.user,
                title=title
            )

        # Save the student's message
        student_msg = ChatMessage.objects.create(
            session=session,
            sender='student',
            message=user_message
        )

        # Get Supabase User ID from header
        supabase_user_id = request.headers.get('X-User-ID')

        # Build RAG context from student's database records (Supabase)
        rag_context = build_rag_context(request.user, user_message, supabase_user_id)

        # Build conversation history for multi-turn context
        previous_messages = ChatMessage.objects.filter(
            session=session
        ).order_by('created_at')[:20]  # Last 20 messages

        conversation_history = []
        for msg in previous_messages:
            if msg.id == student_msg.id:
                continue  # Skip the current message, it's in the prompt
            conversation_history.append({
                'role': 'user' if msg.sender == 'student' else 'model',
                'text': msg.message
            })

        # Call Groq API with context
        ai_response = get_groq_response(
            user_message=user_message,
            context=rag_context,
            conversation_history=conversation_history
        )

        # Save the AI response
        assistant_msg = ChatMessage.objects.create(
            session=session,
            sender='assistant',
            message=ai_response
        )

        # Update session timestamp
        session.save()  # Triggers updated_at auto_now

        return Response({
            'session_id': session.id,
            'session_title': session.title,
            'user_message': ChatMessageSerializer(student_msg).data,
            'ai_response': ChatMessageSerializer(assistant_msg).data,
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception(f"Error in send_message for user {request.user.id}: {str(e)}")
        return Response(
            {'error': 'An unexpected error occurred. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ──────────────────────────────────────────────────────────────
# GET /api/chat/history/ — List all sessions for the student
# ──────────────────────────────────────────────────────────────
@api_view(['GET'])
@authentication_classes([ChatBotAuthentication])
@permission_classes([IsAuthenticated])
def list_sessions(request):
    """Returns all chat sessions for the authenticated student, newest first."""
    err = _ensure_student(request)
    if err:
        return err

    sessions = ChatSession.objects.filter(student=request.user)
    serializer = ChatSessionSerializer(sessions, many=True)
    return Response(serializer.data)


# ──────────────────────────────────────────────────────────────
# GET /api/chat/history/<session_id>/ — Get messages in a session
# ──────────────────────────────────────────────────────────────
@api_view(['GET'])
@authentication_classes([ChatBotAuthentication])
@permission_classes([IsAuthenticated])
def get_session_messages(request, session_id):
    """Returns all messages in a specific chat session."""
    err = _ensure_student(request)
    if err:
        return err

    try:
        session = ChatSession.objects.get(id=session_id, student=request.user)
    except ChatSession.DoesNotExist:
        return Response(
            {'error': 'Chat session not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = ChatSessionDetailSerializer(session)
    return Response(serializer.data)


# ──────────────────────────────────────────────────────────────
# DELETE /api/chat/history/ — Clear all chat history
# ──────────────────────────────────────────────────────────────
@api_view(['DELETE'])
@authentication_classes([ChatBotAuthentication])
@permission_classes([IsAuthenticated])
def clear_all_history(request):
    """Deletes all chat sessions and messages for the authenticated student."""
    err = _ensure_student(request)
    if err:
        return err

    count, _ = ChatSession.objects.filter(student=request.user).delete()
    return Response({
        'message': f'Cleared {count} chat sessions.',
        'deleted_count': count
    })


# ──────────────────────────────────────────────────────────────
# DELETE /api/chat/history/<session_id>/ — Delete a specific session
# ──────────────────────────────────────────────────────────────
@api_view(['DELETE'])
@authentication_classes([ChatBotAuthentication])
@permission_classes([IsAuthenticated])
def delete_session(request, session_id):
    """Deletes a specific chat session and all its messages."""
    err = _ensure_student(request)
    if err:
        return err

    try:
        session = ChatSession.objects.get(id=session_id, student=request.user)
        session.delete()
        return Response({'message': 'Chat session deleted.'})
    except ChatSession.DoesNotExist:
        return Response(
            {'error': 'Chat session not found.'},
            status=status.HTTP_404_NOT_FOUND
        )
