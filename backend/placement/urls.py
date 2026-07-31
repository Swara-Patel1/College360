"""URL routes for the placement-prediction API."""
from django.urls import path

from . import views

urlpatterns = [
    path('predict/', views.predict, name='placement-predict'),
    path('me/', views.my_readiness, name='placement-me'),
    path('leaderboard/', views.leaderboard, name='placement-leaderboard'),
    path('model-info/', views.model_info, name='placement-model-info'),
    path('retrain/', views.retrain, name='placement-retrain'),
    path('student/<str:student_id>/', views.student_readiness, name='placement-student'),
]
