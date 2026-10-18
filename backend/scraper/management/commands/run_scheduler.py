import time
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from scraper.models import ScrapeJob
from scraper.views import execute_scrape

INTERVALS = {
    "every_15_minutes": timedelta(minutes=15),
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
}

class Command(BaseCommand):
    help = "Run active recurring scrape jobs. Keep this process running."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("SmartScrape AI scheduler started. Press Ctrl+C to stop."))
        while True:
            now = timezone.now()
            for job in ScrapeJob.objects.filter(is_active=True).exclude(schedule="manual"):
                interval = INTERVALS.get(job.schedule)
                if interval and (job.last_run_at is None or now - job.last_run_at >= interval):
                    self.stdout.write(f"Running job #{job.id}: {job.name}")
                    run = execute_scrape(job.url, job.selectors, job=job)
                    self.stdout.write(f"  -> {run.status}")
            time.sleep(30)
