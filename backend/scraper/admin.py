from django.contrib import admin
from .models import ScrapeJob, ScrapeRun

@admin.register(ScrapeJob)
class ScrapeJobAdmin(admin.ModelAdmin):
    list_display = ("name", "url", "schedule", "is_active", "last_run_at", "updated_at")
    list_filter = ("schedule", "is_active")
    search_fields = ("name", "url")

@admin.register(ScrapeRun)
class ScrapeRunAdmin(admin.ModelAdmin):
    list_display = ("url", "status", "records_count", "duration_ms", "created_at")
    list_filter = ("status",)
    search_fields = ("url", "error")
    readonly_fields = ("created_at",)
