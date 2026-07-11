"""
Groq AI Service — Handles communication with Groq's Cloud API.
Loads API key from environment variables and sends prompts with RAG context.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# System prompt that defines the AI assistant's personality and behavior
# ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are "LJU Student Assistant", an AI assistant for students of Lok Jagruti University (LJU).

RESPONSIBILITIES:
• Answer questions about attendance, timetable, examinations, fees, placements, internships, projects, and university procedures.
• Explain concepts in simple, clear language that students can easily understand.
• Help students prepare for placements and interviews with tips and guidance.
• Provide accurate guidance using the student's own university data when available.
• If information is unavailable, respond: "I don't have that information right now. Please contact the concerned department."

BEHAVIOR GUIDELINES:
• Be friendly, supportive, and professional at all times.
• Address the student by their first name when you know it.
• Format responses with bullet points, numbered lists, and sections for readability.
• When showing data (grades, attendance, fees), present it in a clean, organized format.
• For placement queries, consider the student's CGPA, department, skills, and eligibility criteria.
• Keep responses concise but informative — avoid unnecessary verbosity.
• Use emojis sparingly for a friendly tone (📊, ✅, 📅, 💡, etc.).
• If a student seems stressed, be encouraging and empathetic.
• Never make up data — only use the context provided to you.
• If you calculate something (like CGPA or attendance %), show your reasoning briefly.

FORMATTING:
• Use **bold** for important terms and values.
• Use bullet points for lists.
• Use line breaks for readability.
• For tabular data, use aligned text formatting.
"""


def get_groq_response(user_message, context="", conversation_history=None):
    """
    Sends a message to Groq (Llama 3.3 70B) and returns the AI response.

    Args:
        user_message (str): The student's question/message.
        context (str): RAG-retrieved context about the student's data.
        conversation_history (list): Previous messages for multi-turn context.
            Each item: {'role': 'user'|'model', 'text': '...'}

    Returns:
        str: The AI assistant's response text.
    """
    try:
        from groq import Groq
    except ImportError:
        logger.error("groq package not installed. Run: pip install groq")
        return ("I'm currently unavailable due to a configuration issue. "
                "Please try again later or contact the IT department.")

    api_key = getattr(settings, 'GROQ_API_KEY', None)
    if not api_key or api_key == 'your-groq-api-key-here':
        logger.error("GROQ_API_KEY is not configured in settings.")
        return ("I'm currently unavailable. The AI service has not been configured yet. "
                "Please contact the administrator.")

    try:
        # Initialize Groq client
        client = Groq(api_key=api_key)

        # Build the full prompt with context
        full_prompt = _build_prompt(user_message, context)

        # Construct messages list for chat completions
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

        if conversation_history:
            for msg in conversation_history[-10:]:  # Last 10 messages for context window
                role = 'assistant' if msg['role'] == 'model' else msg['role']
                messages.append({
                    "role": role,
                    "content": msg['text']
                })

        messages.append({
            "role": "user",
            "content": full_prompt
        })

        # Send request to Groq API
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
            top_p=0.9
        )

        # Extract and return the response text
        if completion and completion.choices:
            response_text = completion.choices[0].message.content
            if response_text:
                return response_text.strip()
        
        logger.warning("Groq returned empty response")
        return "I couldn't generate a response. Please try rephrasing your question."

    except Exception as e:
        logger.exception(f"Groq API error: {str(e)}")

        # Provide user-friendly error messages based on error type
        error_str = str(e).lower()
        if 'quota' in error_str or 'rate' in error_str or '429' in error_str:
            return ("I'm receiving too many requests right now. "
                    "Please wait a moment and try again. ⏳")
        elif 'api_key' in error_str or 'authentication' in error_str or '401' in error_str:
            return ("There's an authentication issue with the AI service. "
                    "Please contact the administrator.")
        else:
            return ("I encountered an unexpected error. Please try again. "
                    "If the issue persists, contact the IT department.")


def _build_prompt(user_message, context=""):
    """
    Constructs the full prompt by combining RAG context with the user's question.

    Args:
        user_message (str): The student's question.
        context (str): Retrieved context from the database.

    Returns:
        str: The complete prompt to send to Groq.
    """
    parts = []

    if context:
        parts.append(
            "── STUDENT DATA CONTEXT ──\n"
            "The following is real data from the university database for this student. "
            "Use it to answer their question accurately.\n\n"
            f"{context}\n"
            "── END OF CONTEXT ──\n"
        )

    parts.append(f"Student's Question: {user_message}")

    return "\n".join(parts)
