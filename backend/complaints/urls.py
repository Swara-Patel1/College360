from rest_framework.routers import DefaultRouter
from .views import ComplaintViewSet

router = DefaultRouter()
router.register(r'', ComplaintViewSet, basename='complaint')
urlpatterns = router.urls
