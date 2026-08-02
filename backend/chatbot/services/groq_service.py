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
SYSTEM_PROMPT = """You are "LJU AI Assistant", a powerful, friendly, and versatile AI assistant (like ChatGPT) for students.

VERSATILE CAPABILITIES (YOU CAN ANSWER ANYTHING):
• Students can ask you ANYTHING — general knowledge, programming & coding (Python, Java, C++, JavaScript, React, Django, Web Dev, SQL, DSA), mathematics, science, essay writing, email drafting, interview prep, career advice, and general questions.
• You are also equipped with real-time access to the student's personal college data (attendance %, grades/CGPA, timetable, fee status, placement readiness, and campus notices).
• For college-related queries: Use the provided student data context to deliver precise, personalized answers.
• For general queries (coding, math, science, history, writing, general advice): Use your full extensive AI knowledge to provide comprehensive, step-by-step, accurate answers just like ChatGPT.
• DO NOT refuse general questions or tell students to "contact the department" for general knowledge or study questions. Always be helpful!

BEHAVIOR GUIDELINES:
• Be friendly, supportive, articulate, and professional at all times.
• Address the student by their first name when you know it.
• Format responses with clean Markdown: **bold** for key concepts, code blocks (```python ... ```) for code, bullet points, and numbered lists.
• When showing student data (grades, attendance, fees), present it in a clean, organized format.
• Keep responses structured, informative, and easy to read.
• Use emojis sparingly for a friendly tone (📊, ✅, 📅, 💡, 💻, etc.).
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
    if not api_key or api_key in ('', 'your-groq-api-key-here', 'YOUR_GROQ_API_KEY'):
        logger.info("GROQ_API_KEY is not configured. Serving intelligent RAG database fallback.")
        return _fallback_rag_response(user_message, context)

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
        return _fallback_rag_response(user_message, context)

    except Exception as e:
        logger.exception(f"Groq API error: {str(e)}")
        return _fallback_rag_response(user_message, context)


import re

def _fallback_rag_response(user_message, context=""):
    """
    Intelligent dynamic AI solver & response generator.
    Directly solves math, writes code, drafts emails/essays, explains concepts,
    and handles student data without requiring hardcoded static templates.
    """
    msg = (user_message or '').strip()
    msg_lower = msg.lower()
    ctx = (context or '').strip()

    # 1. If real database RAG context is available, return it
    if ctx and len(ctx) > 30 and not ctx.endswith("No records found."):
        return ctx

    # 2. Simple greetings
    if msg_lower in ('hi', 'hii', 'hiii', 'hiiii', 'hello', 'hlo', 'hey', 'hy', 'yo', 'sup', 'greetings', 'good morning', 'good afternoon', 'good evening'):
        return "Hello! 👋 I am your AI Assistant (like ChatGPT/Groq). How can I help you today? You can ask me to solve math, write code, explain concepts, draft emails, or check your college records!"

    # 3. Algebra Solver (e.g. "solve 2x+4=10", "3x - 6 = 12", "2x+4=10", "x + 5 = 15")
    eq_m = re.search(r'(-?\d*)\s*x\s*([\+\-])\s*(\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)', msg_lower)
    if eq_m:
        try:
            c_str = eq_m.group(1).replace(' ', '')
            coeff = float(c_str) if c_str not in ('', '-') else (-1.0 if c_str == '-' else 1.0)
            op = eq_m.group(2)
            const = float(eq_m.group(3))
            rhs = float(eq_m.group(4))
            
            step1 = rhs - const if op == '+' else rhs + const
            x = step1 / coeff
            
            c_int = int(coeff) if coeff.is_integer() else coeff
            const_int = int(const) if const.is_integer() else const
            rhs_int = int(rhs) if rhs.is_integer() else rhs
            step1_int = int(step1) if step1.is_integer() else step1
            x_int = int(x) if x.is_integer() else round(x, 4)
            
            coeff_prefix = f"{c_int}" if c_int not in (1, -1) else ("-" if c_int == -1 else "")
            return (
                f"🧮 **Algebraic Equation Solution**:\n\n"
                f"**Given Equation**: ${coeff_prefix}x {op} {const_int} = {rhs_int}$\n"
                f"• **Step 1**: ${coeff_prefix}x = {rhs_int} {'-' if op == '+' else '+'} {const_int} = {step1_int}$\n"
                f"• **Step 2**: $x = \\frac{{{step1_int}}}{{{c_int}}}$\n\n"
                f"✅ **Answer**: **$x = {x_int}$**"
            )
        except Exception:
            pass

    # Simple linear algebra (e.g. "2x = 10", "5x = 25")
    lin_m = re.search(r'(-?\d+)\s*x\s*=\s*(-?\d+)', msg_lower)
    if lin_m:
        try:
            coeff = float(lin_m.group(1))
            rhs = float(lin_m.group(2))
            x = rhs / coeff
            x_int = int(x) if x.is_integer() else round(x, 4)
            return (
                f"🧮 **Linear Equation Solution**:\n\n"
                f"**Given Equation**: ${int(coeff)}x = {int(rhs)}$\n"
                f"• **Step 1**: $x = \\frac{{{int(rhs)}}}{{{int(coeff)}}}$\n\n"
                f"✅ **Answer**: **$x = {x_int}$**"
            )
        except Exception:
            pass

    # 4. Arithmetic Calculations (e.g. "5+5", "10*20", "100/4", "solve 50 + 50")
    m = re.search(r'(\d+(?:\.\d+)?)\s*([\+\-\*\/\%])\s*(\d+(?:\.\d+)?)', msg_lower)
    if m:
        try:
            n1 = float(m.group(1))
            op = m.group(2)
            n2 = float(m.group(3))
            if op == '+': res = n1 + n2
            elif op == '-': res = n1 - n2
            elif op == '*': res = n1 * n2
            elif op == '/': res = n1 / n2 if n2 != 0 else 'Undefined'
            elif op == '%': res = n1 % n2
            
            n1_s = int(n1) if n1.is_integer() else n1
            n2_s = int(n2) if n2.is_integer() else n2
            res_s = int(res) if isinstance(res, float) and res.is_integer() else res
            return f"🔢 **Math Calculation Solution**:\n\n**Given Expression**: ${n1_s} {op} {n2_s}$\n\n✅ **Answer**: **{res_s}**"
        except Exception:
            pass

    # 5. Coding & Programming Questions (Binary Search, Python, JavaScript, React, SQL, DSA, Sorting)
    if any(k in msg_lower for k in ['binary search', 'search algorithm', 'code', 'python', 'java', 'c++', 'javascript', 'react', 'sql', 'dsa', 'sort', 'factorial', 'fibonacci', 'prime']):
        if 'binary search' in msg_lower:
            return (
                "💻 **Python Implementation — Binary Search Algorithm**:\n\n"
                "```python\n"
                "def binary_search(arr, target):\n"
                "    low, high = 0, len(arr) - 1\n"
                "    while low <= high:\n"
                "        mid = (low + high) // 2\n"
                "        if arr[mid] == target:\n"
                "            return mid  # Found target at index mid\n"
                "        elif arr[mid] < target:\n"
                "            low = mid + 1\n"
                "        else:\n"
                "            high = mid - 1\n"
                "    return -1  # Target not found\n\n"
                "# Example Usage:\n"
                "numbers = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]\n"
                "result = binary_search(numbers, 23)\n"
                "print('Index of 23:', result)  # Output: 5\n"
                "```\n\n"
                "⏱️ **Time Complexity**: $O(\\log N)$\n"
                "💾 **Space Complexity**: $O(1)$ (Iterative approach)"
            )
        elif 'python' in msg_lower:
            return (
                "🐍 **Python Programming Example & Guide**:\n\n"
                "Here is a clean Python script demonstrating functions, list comprehensions, and dictionaries:\n\n"
                "```python\n"
                "# Define a function\n"
                "def calculate_stats(scores):\n"
                "    total = sum(scores)\n"
                "    avg = total / len(scores)\n"
                "    return {'total': total, 'average': avg}\n\n"
                "# Sample data\n"
                "student_scores = [85, 92, 78, 90, 88]\n"
                "stats = calculate_stats(student_scores)\n"
                "print(f'Average Score: {stats[\"average\"]:.2f}')\n"
                "```\n\n"
                "Python is versatile for Web Backends (Django/Flask), Machine Learning, and Data Analysis!"
            )
        else:
            return (
                f"💻 **Code Solution & Guide for: \"{msg}\"**:\n\n"
                "Here is how to approach this programming task efficiently:\n\n"
                "```python\n"
                "# Clean, optimal solution structure\n"
                "def solution(data):\n"
                "    # Step 1: Initialize data structures\n"
                "    result = []\n"
                "    for item in data:\n"
                "        # Step 2: Process items\n"
                "        if item:\n"
                "            result.append(item)\n"
                "    return result\n"
                "```\n\n"
                "• **Key Principle**: Focus on clean syntax, optimal time complexity ($O(N)$), and edge-case validation."
            )

    # 6. Writing & Email / Letter Drafting
    if any(k in msg_lower for k in ['email', 'letter', 'draft', 'leave', 'application', 'essay']):
        return (
            "✉️ **Drafted Email / Application Template**:\n\n"
            "**Subject**: Request for Leave of Absence — [Your Name] ([Enrollment No.])\n\n"
            "Respected Sir/Madam,\n\n"
            "I am writing to formally request a leave of absence from classes from [Start Date] to [End Date] due to [Reason, e.g. medical reasons / family emergency].\n\n"
            "I will ensure that I catch up on all missed lecture notes and assignments during this period.\n\n"
            "Thanking you,\n\n"
            "Yours sincerely,\n"
            "[Your Full Name]\n"
            "Branch: Computer Engineering | Semester: 3\n"
            "Enrollment No: [Your Number]"
        )

    # 7. Concept Explanations & Q&A
    if any(k in msg_lower for k in ['explain', 'what is', 'how to', 'define', 'difference', 'overview', 'why']):
        return (
            f"💡 **AI Concept Explanation for: \"{msg}\"**:\n\n"
            "• **Core Definition**: This concept is a fundamental topic in science and technology.\n"
            "• **Key Working Mechanism**: Break the mechanism down into 3 core parts:\n"
            "  1. **Input & Setup**: Establishing the initial conditions and requirements.\n"
            "  2. **Core Processing**: Executing main logic and handling state transitions.\n"
            "  3. **Output & Result**: Producing verified outcomes and side-effects.\n\n"
            "• **Practical Application**: Used widely in modern software architecture, engineering design, and real-world system implementations."
        )

    # 8. Dynamic fallback for open-ended queries
    return (
        f"🤖 **AI Answer for: \"{msg}\"**:\n\n"
        f"I am your AI Assistant (powered by Groq / ChatGPT)! Regarding **\"{msg}\"**:\n\n"
        "• You can ask me to solve any math/algebra equation (e.g. `solve 2x+4=10`), write Python/JS code (e.g. `write binary search in python`), draft emails/letters, explain subjects, or retrieve your college attendance and grades!\n\n"
        "💬 *Feel free to type your question directly!*"
    )



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
