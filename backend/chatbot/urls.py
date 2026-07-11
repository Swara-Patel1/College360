"""
Chatbot URL Configuration
Maps API endpoints to their view functions.

Endpoints:
    POST   /api/chat/                     → Send message, get AI response
    GET    /api/chat/history/             → List all chat sessions
    GET    /api/chat/history/<id>/        → Get messages for a session
    DELETE /api/chat/history/             → Clear all chat history
    DELETE /api/chat/history/<id>/        → Delete a specific session
"""
from django.urls import path
from . import views

urlpatterns = [
    # Main chat endpoint
    path('', views.send_message, name='chat-send'),

    # Chat history endpoints
    path('history/', views.list_sessions, name='chat-history'),
    path('history/<int:session_id>/', views.get_session_messages, name='chat-session-detail'),

    # Delete endpoints (using the same paths, differentiated by HTTP method)
    path('history/clear/', views.clear_all_history, name='chat-clear-all'),
    path('history/<int:session_id>/delete/', views.delete_session, name='chat-delete-session'),
]
