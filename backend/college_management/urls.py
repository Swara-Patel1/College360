from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/students/', include('students.urls')),
    path('api/faculty/', include('faculty.urls')),
    path('api/courses/', include('courses.urls')),
    path('api/attendance/', include('attendance.urls')),
    path('api/grades/', include('grades.urls')),
    path('api/fees/', include('fees.urls')),
    path('api/timetable/', include('timetable.urls')),
    path('api/notices/', include('notices.urls')),
    path('api/complaints/', include('complaints.urls')),
    path('api/chat/', include('chatbot.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
