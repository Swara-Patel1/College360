from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_compat import RestV1View

urlpatterns = [
    path('admin/', admin.site.urls),
    # PostgREST-compatible layer — used by the React frontend's SupaFetch client
    path('rest/v1/<path:table>', RestV1View.as_view(), name='rest-v1'),
    # Django DRF API endpoints
    path('api/auth/', include('accounts.urls')),
    path('api/chat/', include('chatbot.urls')),
    path('api/placement/', include('placement.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/analytics/', include('analytics.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
