from datetime import date
from django.db import models
from django.utils import timezone


class StudyMaterial(models.Model):
    """Faculty-uploaded study content (notes, videos, assignments, references)."""
    CONTENT_TYPES = [
        ('notes', 'Notes'),
        ('video', 'Video'),
        ('assignment', 'Assignment'),
        ('reference', 'Reference'),
        ('slides', 'Slides'),
    ]
    course = models.ForeignKey('courses.Course', on_delete=models.CASCADE, related_name='study_materials')
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='study_materials')
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES, default='notes')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    file_url = models.URLField(max_length=500, blank=True)
    video_url = models.URLField(max_length=500, blank=True)
    topic_tag = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.title} ({self.content_type})'


class Doubt(models.Model):
    """Student-submitted conceptual doubts, resolved by faculty with an SLA."""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('ai_answered', 'AI Answered'),
        ('under_review', 'Under Review'),
        ('resolved', 'Resolved'),
        ('escalated', 'Escalated'),
    ]
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='doubts')
    course = models.ForeignKey('courses.Course', on_delete=models.SET_NULL, null=True, blank=True, related_name='doubts')
    question = models.TextField()
    attachment_url = models.URLField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    assigned_faculty = models.ForeignKey('faculty.Faculty', on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='assigned_doubts')
    resolution = models.TextField(blank=True)
    # AI (RAG) syllabus-assistant fields — an instant first-response before faculty.
    ai_answer = models.TextField(blank=True)
    ai_confidence = models.PositiveSmallIntegerField(default=0)  # 0–100
    ai_sources = models.TextField(blank=True)  # semicolon-joined source titles
    ai_answered_at = models.DateTimeField(null=True, blank=True)
    ai_helpful = models.BooleanField(null=True, blank=True)  # student feedback on the AI answer
    sla_deadline = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f'Doubt #{self.pk} — {self.status}'


class Exam(models.Model):
    """A scheduled examination for a course (exam timetable + seat planning)."""
    EXAM_TYPES = [
        ('midterm', 'Mid-Term'),
        ('endsem', 'End-Semester'),
        ('practical', 'Practical'),
        ('quiz', 'Quiz'),
        ('viva', 'Viva'),
    ]
    course = models.ForeignKey('courses.Course', on_delete=models.CASCADE, related_name='exams')
    exam_type = models.CharField(max_length=12, choices=EXAM_TYPES, default='endsem')
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    building = models.CharField(max_length=50, blank=True)
    max_marks = models.PositiveSmallIntegerField(default=100)
    seats_per_room = models.PositiveSmallIntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'start_time']

    @property
    def semester(self):
        return self.course.semester

    def __str__(self):
        return f'{self.course.code} {self.exam_type} on {self.date}'


class Backlog(models.Model):
    """A failed course (KT) a student must re-register for and clear."""
    STATUS_CHOICES = [
        ('active', 'Active'),        # failed, not yet re-registered
        ('registered', 'Registered'),  # signed up for a re-exam
        ('cleared', 'Cleared'),      # passed on re-attempt
    ]
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='backlogs')
    course = models.ForeignKey('courses.Course', on_delete=models.CASCADE, related_name='backlogs')
    semester = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='active')
    attempts = models.PositiveSmallIntegerField(default=1)
    reexam_date = models.DateField(null=True, blank=True)
    cleared_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['status', '-created_at']
        unique_together = ('student', 'course')

    def __str__(self):
        return f'{self.student} — {self.course.code} ({self.status})'



class FacultyFeedback(models.Model):
    """Anonymous-capable student feedback survey for a faculty member."""
    student = models.ForeignKey('students.Student', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='given_feedback')
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE, related_name='feedback')
    course = models.ForeignKey('courses.Course', on_delete=models.SET_NULL, null=True, blank=True,
                               related_name='feedback')
    # 1–5 Likert ratings across four dimensions.
    teaching = models.PositiveSmallIntegerField(default=3)
    knowledge = models.PositiveSmallIntegerField(default=3)
    communication = models.PositiveSmallIntegerField(default=3)
    punctuality = models.PositiveSmallIntegerField(default=3)
    comment = models.TextField(blank=True)
    is_anonymous = models.BooleanField(default=True)
    academic_year = models.CharField(max_length=10, default='2024-25')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def overall(self):
        return round((self.teaching + self.knowledge + self.communication + self.punctuality) / 4, 2)

    def __str__(self):
        return f'Feedback for {self.faculty} — {self.overall}/5'


class Delegation(models.Model):
    """A temporary transfer of specific HOD powers to a deputy faculty member."""
    department = models.ForeignKey('faculty.Department', on_delete=models.CASCADE, related_name='delegations')
    delegator = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE, related_name='delegations_given')
    delegate = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE, related_name='delegations_received')
    can_approve_leaves = models.BooleanField(default=True)
    can_manage_timetable = models.BooleanField(default=False)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)  # cleared on revoke
    reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date', '-created_at']

    @property
    def scopes(self):
        s = []
        if self.can_approve_leaves:
            s.append('leaves')
        if self.can_manage_timetable:
            s.append('timetable')
        return s

    @staticmethod
    def _as_date(v):
        """Coerce an ISO string (unsaved instance) to a date; pass dates through."""
        if isinstance(v, str):
            return date.fromisoformat(v[:10])
        if hasattr(v, 'date') and not isinstance(v, date):  # datetime
            return v.date()
        return v

    def is_effective(self, as_of=None):
        """True when the delegation is live (active and within its date window)."""
        today = as_of or timezone.localdate()
        start, end = self._as_date(self.start_date), self._as_date(self.end_date)
        return self.is_active and start <= today <= end

    def __str__(self):
        return f'{self.delegator} → {self.delegate} ({", ".join(self.scopes) or "no scopes"})'


class Internship(models.Model):
    """A student-submitted internship / industrial training record."""
    STATUS_CHOICES = [('ongoing', 'Ongoing'), ('completed', 'Completed')]
    WORK_MODES = [('onsite', 'On-site'), ('remote', 'Remote'), ('hybrid', 'Hybrid')]
    VERIFY_CHOICES = [('pending', 'Pending'), ('verified', 'Verified'), ('rejected', 'Rejected')]

    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='internships')
    company = models.CharField(max_length=200)
    role = models.CharField(max_length=200)
    location = models.CharField(max_length=150, blank=True)
    work_mode = models.CharField(max_length=10, choices=WORK_MODES, default='onsite')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    stipend = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    skills = models.CharField(max_length=300, blank=True)
    certificate_url = models.URLField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ongoing')
    verification = models.CharField(max_length=10, choices=VERIFY_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date', '-created_at']

    def __str__(self):
        return f'{self.student} @ {self.company} ({self.role})'


class Achievement(models.Model):
    """A student achievement / extracurricular log entry (awards, competitions, activities)."""
    CATEGORY_CHOICES = [
        ('technical', 'Technical'),
        ('sports', 'Sports'),
        ('cultural', 'Cultural'),
        ('academic', 'Academic'),
        ('social', 'Social / Volunteering'),
        ('other', 'Other'),
    ]
    LEVEL_CHOICES = [
        ('college', 'College'),
        ('state', 'State'),
        ('national', 'National'),
        ('international', 'International'),
    ]
    VERIFY_CHOICES = [('pending', 'Pending'), ('verified', 'Verified'), ('rejected', 'Rejected')]

    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='achievements')
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=12, choices=CATEGORY_CHOICES, default='technical')
    level = models.CharField(max_length=15, choices=LEVEL_CHOICES, default='college')
    organization = models.CharField(max_length=200, blank=True)
    date_awarded = models.DateField()
    position = models.CharField(max_length=100, blank=True)  # e.g. "1st Prize", "Finalist"
    description = models.TextField(blank=True)
    certificate_url = models.URLField(max_length=500, blank=True)
    verification = models.CharField(max_length=10, choices=VERIFY_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_awarded', '-created_at']

    def __str__(self):
        return f'{self.student} — {self.title} ({self.level})'


class Book(models.Model):
    """A title in the library inventory. Copies are tracked as a simple count."""
    isbn = models.CharField(max_length=20, blank=True, db_index=True)
    barcode = models.CharField(max_length=40, blank=True, db_index=True)
    title = models.CharField(max_length=250)
    author = models.CharField(max_length=200, blank=True)
    publisher = models.CharField(max_length=150, blank=True)
    edition = models.CharField(max_length=50, blank=True)
    category = models.CharField(max_length=100, blank=True)
    department = models.ForeignKey('faculty.Department', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='books')
    shelf = models.CharField(max_length=50, blank=True)
    total_copies = models.PositiveIntegerField(default=1)
    available_copies = models.PositiveIntegerField(default=1)
    cover_url = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} — {self.author}'


class BookLoan(models.Model):
    """A checkout/return record with due date and fine tracking."""
    STATUS_CHOICES = [
        ('issued', 'Issued'),
        ('returned', 'Returned'),
        ('lost', 'Lost'),
    ]
    FINE_PER_DAY = 5  # ₹ per overdue day

    book = models.ForeignKey('Book', on_delete=models.CASCADE, related_name='loans')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='book_loans')
    issued_at = models.DateField(default=timezone.localdate)
    due_date = models.DateField()
    returned_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='issued')
    fine = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    fine_paid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-issued_at', '-created_at']

    @staticmethod
    def _as_date(v):
        """Coerce a value that may be an ISO string (unsaved instance) to a date."""
        if v is None:
            return None
        if isinstance(v, str):
            return date.fromisoformat(v[:10])
        if hasattr(v, 'date') and not isinstance(v, date):  # datetime
            return v.date()
        return v

    def overdue_days(self, as_of=None):
        """Days past the due date (0 if not overdue). Uses return date once returned."""
        end = self._as_date(self.returned_at) or as_of or timezone.localdate()
        due = self._as_date(self.due_date)
        if not due:
            return 0
        return max(0, (end - due).days)

    def computed_fine(self, as_of=None):
        return self.overdue_days(as_of) * self.FINE_PER_DAY

    def __str__(self):
        return f'{self.book.title} → {self.student} ({self.status})'


