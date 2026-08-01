from django.contrib import admin
from .models import StudyMaterial, Doubt, FacultyFeedback, Backlog, Exam


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('course', 'exam_type', 'date', 'start_time', 'end_time', 'room')
    list_filter = ('exam_type', 'date')
    search_fields = ('course__code', 'course__name', 'room')


@admin.register(Backlog)
class BacklogAdmin(admin.ModelAdmin):
    list_display = ('student', 'course', 'semester', 'status', 'attempts', 'reexam_date', 'cleared_date')
    list_filter = ('status', 'semester')
    search_fields = ('student__student_id', 'course__code')




@admin.register(StudyMaterial)
class StudyMaterialAdmin(admin.ModelAdmin):
    list_display = ('title', 'content_type', 'course', 'faculty', 'is_active', 'uploaded_at')
    list_filter = ('content_type', 'is_active')
    search_fields = ('title', 'topic_tag')


@admin.register(Doubt)
class DoubtAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'course', 'status', 'submitted_at', 'resolved_at')
    list_filter = ('status',)
    search_fields = ('question',)


@admin.register(FacultyFeedback)
class FacultyFeedbackAdmin(admin.ModelAdmin):
    list_display = ('faculty', 'course', 'overall', 'is_anonymous', 'created_at')
    list_filter = ('is_anonymous', 'academic_year')


