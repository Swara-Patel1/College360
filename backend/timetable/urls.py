from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ScheduleViewSet

router = DefaultRouter()
router.register('', ScheduleViewSet)
urlpatterns = [path('', include(router.urls))]
