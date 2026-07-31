"""URL routes for the report-download API."""
from django.urls import path

from . import views

urlpatterns = [
    path('my/marksheet/', views.my_marksheet, name='report-my-marksheet'),
    path('department-summary/', views.department_summary, name='report-dept-summary'),
    path('marksheet/<str:student_id>/', views.marksheet, name='report-marksheet'),
    path('fee-statement/<str:student_id>/', views.fee_statement, name='report-fee-statement'),
    path('attendance/<str:student_id>/', views.attendance, name='report-attendance'),
]
