from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CourseViewSet, EnrollmentViewSet

router = DefaultRouter()
router.register('enrollments', EnrollmentViewSet)
router.register('', CourseViewSet)
urlpatterns = [path('', include(router.urls))]
