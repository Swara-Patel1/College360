from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('profile/', views.profile_view, name='profile'),
    path('profile/upload-avatar/', views.upload_avatar_view, name='upload-avatar'),
    path('change-password/', views.change_password_view, name='change-password'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('users/', views.users_list, name='users-list'),
    path('users/<int:pk>/delete/', views.delete_user, name='delete-user'),
    path('dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),
]
