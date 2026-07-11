"""
Basic tests for the chatbot app.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from .models import ChatSession, ChatMessage

User = get_user_model()


class ChatModelTests(TestCase):
    """Tests for ChatSession and ChatMessage models."""

    def setUp(self):
        """Create a test student user."""
        self.student = User.objects.create_user(
            username='teststudent',
            email='teststudent@lju.edu.in',
            password='testpass123',
            role='student',
            first_name='Test',
            last_name='Student',
        )

    def test_create_session(self):
        """Test creating a chat session."""
        session = ChatSession.objects.create(
            student=self.student,
            title='Test Conversation'
        )
        self.assertEqual(session.student, self.student)
        self.assertEqual(session.title, 'Test Conversation')
        self.assertIsNotNone(session.created_at)

    def test_create_message(self):
        """Test creating chat messages."""
        session = ChatSession.objects.create(
            student=self.student,
            title='Test Conversation'
        )
        msg = ChatMessage.objects.create(
            session=session,
            sender='student',
            message='What is my attendance?'
        )
        self.assertEqual(msg.sender, 'student')
        self.assertEqual(msg.session, session)

    def test_session_ordering(self):
        """Test that sessions are ordered by updated_at desc."""
        s1 = ChatSession.objects.create(student=self.student, title='First')
        s2 = ChatSession.objects.create(student=self.student, title='Second')
        sessions = list(ChatSession.objects.all())
        # Most recent should be first
        self.assertEqual(sessions[0].id, s2.id)

    def test_message_ordering(self):
        """Test that messages are ordered by created_at asc."""
        session = ChatSession.objects.create(student=self.student, title='Test')
        m1 = ChatMessage.objects.create(session=session, sender='student', message='Hello')
        m2 = ChatMessage.objects.create(session=session, sender='assistant', message='Hi!')
        messages = list(session.messages.all())
        self.assertEqual(messages[0].id, m1.id)
        self.assertEqual(messages[1].id, m2.id)

    def test_session_str(self):
        """Test string representation of ChatSession."""
        session = ChatSession.objects.create(student=self.student, title='My Chat')
        self.assertIn('Test Student', str(session))
        self.assertIn('My Chat', str(session))

    def test_message_str(self):
        """Test string representation of ChatMessage."""
        session = ChatSession.objects.create(student=self.student, title='Test')
        msg = ChatMessage.objects.create(session=session, sender='student', message='Hello there')
        self.assertIn('[student]', str(msg))
        self.assertIn('Hello there', str(msg))
