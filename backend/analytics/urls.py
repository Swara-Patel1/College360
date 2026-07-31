"""URL routes for the analytics API."""
from django.urls import path

from . import views

urlpatterns = [
    path('me/summary/', views.my_summary, name='analytics-my-summary'),
    path('dashboard/', views.dashboard, name='analytics-dashboard'),
    path('fees/summary/', views.fees_summary, name='analytics-fees-summary'),
    path('attendance/overview/', views.attendance_overview, name='analytics-attendance-overview'),
    path('student/<str:student_id>/summary/', views.student_summary, name='analytics-student-summary'),
    path('student/<str:student_id>/grades/', views.student_grades, name='analytics-student-grades'),
]
