"""
AI Syllabus Assistant for student doubts (Retrieval-Augmented Generation).

When a student posts a doubt we:
  1. Retrieve syllabus context from the Django ORM — the doubt's course description
     and the most relevant study materials (ranked by keyword overlap with the question).
  2. Ask the Groq LLM to answer using ONLY that context (grounded / RAG).
  3. Fall back to an extractive, resource-based answer if the LLM is unavailable,
     so the feature still works offline.

A confidence score (0–100) reflects how much relevant material was found; low
confidence nudges the student to escalate to a faculty member.
"""
import logging
import re

from django.conf import settings

logger = logging.getLogger(__name__)

_STOPWORDS = {
    'the', 'is', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'how', 'what',
    'why', 'do', 'does', 'i', 'my', 'can', 'you', 'me', 'this', 'that', 'with',
    'are', 'be', 'it', 'or', 'as', 'at', 'we', 'if', 'so', 'about', 'please',
    'explain', 'understand', 'doubt', 'question', 'help', 'between', 'difference',
}


def _tokens(text):
    return {w for w in re.findall(r'[a-z0-9]+', (text or '').lower()) if len(w) > 2 and w not in _STOPWORDS}


def _retrieve(doubt):
    """Return (course, ranked_materials, best_overlap) for the doubt's syllabus context."""
    from campus.models import StudyMaterial

    course = doubt.course
    q_tokens = _tokens(doubt.question)

    # Candidate materials: the doubt's course first, else the student's enrolled courses.
    materials = StudyMaterial.objects.select_related('course').filter(is_active=True)
    if course:
        materials = materials.filter(course=course)
    elif doubt.student:
        from courses.models import Enrollment
        course_ids = Enrollment.objects.filter(student=doubt.student, is_active=True).values_list('course_id', flat=True)
        materials = materials.filter(course_id__in=list(course_ids))

    ranked = []
    for m in materials[:200]:
        m_tokens = _tokens(f'{m.title} {m.description} {m.topic_tag}')
        overlap = len(q_tokens & m_tokens)
        ranked.append((overlap, m))
    ranked.sort(key=lambda t: t[0], reverse=True)
    if course:
        # Course-scoped doubt: include top course materials as context even without
        # a keyword hit, so the answer is grounded and sources are shown.
        top = [m for _, m in ranked[:4]]
    else:
        # Searching across many enrolled courses — only keep genuinely relevant hits.
        top = [m for ov, m in ranked if ov > 0][:4]
    best_overlap = ranked[0][0] if ranked else 0
    return course, top, best_overlap, q_tokens


def _confidence(best_overlap, q_tokens, n_materials, has_course_desc):
    """Heuristic 0–100 confidence from keyword coverage and available material."""
    if not q_tokens:
        return 40 if n_materials else 20
    coverage = min(1.0, best_overlap / max(1, min(len(q_tokens), 4)))  # up to 4 keywords matter
    score = coverage * 60 + min(n_materials, 3) * 10 + (10 if has_course_desc else 0)
    return int(max(15, min(95, round(score))))


def _build_context(course, materials):
    parts = []
    if course:
        desc = (course.description or '').strip()
        parts.append(f"COURSE: {course.code} — {course.name}"
                     + (f"\nSYLLABUS/OVERVIEW: {desc}" if desc else ""))
    if materials:
        parts.append("RELEVANT STUDY MATERIALS:")
        for m in materials:
            line = f"• [{m.get_content_type_display()}] {m.title}"
            if m.topic_tag:
                line += f" (topic: {m.topic_tag})"
            if m.description:
                line += f"\n   {m.description.strip()[:280]}"
            parts.append(line)
    return "\n".join(parts).strip()


def _sources(course, materials):
    names = []
    for m in materials:
        names.append(m.title)
    return "; ".join(names)


def _groq_available():
    key = getattr(settings, 'GROQ_API_KEY', '') or ''
    return bool(key) and key != 'your-groq-api-key-here'


def _llm_answer(question, context, student_name=''):
    """Ask Groq to answer the doubt grounded in the syllabus context. Returns text or None."""
    if not _groq_available():
        return None
    try:
        from groq import Groq
        client = Groq(api_key=settings.GROQ_API_KEY)
        system = (
            "You are an AI Academic & Study Tutor (powered by ChatGPT-style AI). Answer the student's "
            "conceptual or programming doubt clearly, accurately, and thoroughly. Use the provided course syllabus "
            "and study-material context when available. If the context does not explicitly cover the doubt, "
            "use your extensive academic and technical knowledge base to provide a clear, step-by-step explanation, "
            "code example, or solution. Use **bold** for key terms, code blocks for code, and bullet points for steps."
        )
        user = (
            f"── SYLLABUS CONTEXT ──\n{context or '(no specific materials found)'}\n── END CONTEXT ──\n\n"
            f"Student{f' ({student_name})' if student_name else ''} asks: {question}"
        )
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.5, max_tokens=900, top_p=0.9,
        )
        if completion and completion.choices:
            text = (completion.choices[0].message.content or '').strip()
            return text or None
    except Exception as e:
        logger.warning(f"Groq doubt answer failed, falling back: {e}")
    return None


def _extractive_answer(question, course, materials):
    """Offline fallback: a resource-based answer assembled from retrieved materials."""
    lines = []
    if course:
        lines.append(f"Here's what your **{course.code} — {course.name}** materials cover on this:")
    else:
        lines.append("Here's what your course materials cover on this:")
    if materials:
        for m in materials:
            bit = f"• **{m.title}**"
            if m.description:
                bit += f" — {m.description.strip()[:200]}"
            if m.file_url or m.video_url:
                bit += f"  (resource: {m.file_url or m.video_url})"
            lines.append(bit)
        lines.append("\nReview the resources above. If your doubt isn't fully cleared, escalate it to a faculty member.")
    else:
        lines.append("• I couldn't find study material closely matching your doubt.")
        lines.append("\nI'd recommend escalating this to a faculty member for a detailed answer.")
    return "\n".join(lines)


def answer_doubt(doubt):
    """
    Produce an AI answer for a Doubt. Returns
    {answer, confidence, sources, engine} where engine is 'llm' or 'extractive'.
    """
    course, materials, best_overlap, q_tokens = _retrieve(doubt)
    context = _build_context(course, materials)
    confidence = _confidence(best_overlap, q_tokens, len(materials), bool(course and course.description))
    student_name = ''
    if doubt.student and doubt.student.user:
        student_name = doubt.student.user.first_name or ''

    answer = _llm_answer(doubt.question, context, student_name)
    engine = 'llm'
    if not answer:
        answer = _extractive_answer(doubt.question, course, materials)
        engine = 'extractive'
        # An extractive-only answer is inherently less authoritative.
        confidence = min(confidence, 55)

    return {
        'answer': answer,
        'confidence': confidence,
        'sources': _sources(course, materials),
        'engine': engine,
    }
