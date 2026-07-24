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


class Parent(models.Model):
    """A read-only guardian account linked to one student."""
    RELATION_CHOICES = [('father', 'Father'), ('mother', 'Mother'), ('guardian', 'Guardian')]
    user = models.OneToOneField('accounts.User', on_delete=models.CASCADE, related_name='parent_profile')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='parents')
    relation = models.CharField(max_length=10, choices=RELATION_CHOICES, default='guardian')
    phone = models.CharField(max_length=15, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user.get_full_name()} → {self.student}'


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


class Alumnus(models.Model):
    """Graduated student record for the alumni directory."""
    # Optionally linked to the original student record (kept even if student row is removed).
    student = models.OneToOneField('students.Student', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='alumnus')
    department = models.ForeignKey('faculty.Department', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='alumni')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    graduation_year = models.PositiveSmallIntegerField()
    degree = models.CharField(max_length=100, blank=True)
    current_company = models.CharField(max_length=150, blank=True)
    designation = models.CharField(max_length=150, blank=True)
    location = models.CharField(max_length=150, blank=True)
    linkedin_url = models.URLField(max_length=300, blank=True)
    available_for_mentorship = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-graduation_year', 'first_name']
        verbose_name_plural = 'Alumni'

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.graduation_year})'
