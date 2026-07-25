from django.contrib import admin
from .models import PlacementCompany

@admin.register(PlacementCompany)
class PlacementCompanyAdmin(admin.ModelAdmin):
    list_display = ['name', 'sector', 'package_lpa', 'min_cpi', 'max_backlogs', 'min_attendance', 'is_active']
    list_filter = ['sector', 'is_active']
    search_fields = ['name', 'roles']
