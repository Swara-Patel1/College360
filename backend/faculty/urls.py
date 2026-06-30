from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FacultyViewSet, DepartmentViewSet

router = DefaultRouter()
router.register('departments', DepartmentViewSet)
router.register('', FacultyViewSet)

urlpatterns = [path('', include(router.urls))]
