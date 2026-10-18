from django.db import models

SCHEDULE_CHOICES = [
    ("manual", "Manual"),
    ("every_15_minutes", "Every 15 minutes"),
    ("hourly", "Hourly"),
    ("daily", "Daily"),
]

class ScrapeJob(models.Model):
    name = models.CharField(max_length=120)
    url = models.URLField(max_length=2048)
    selectors = models.JSONField(default=dict, blank=True)
    schedule = models.CharField(max_length=32, choices=SCHEDULE_CHOICES, default="manual")
    is_active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name

class ScrapeRun(models.Model):
    STATUS_CHOICES = [("success", "Success"), ("failed", "Failed")]
    job = models.ForeignKey(ScrapeJob, on_delete=models.SET_NULL, null=True, blank=True, related_name="runs")
    url = models.URLField(max_length=2048)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(default=0)
    records_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.url} — {self.status}"
