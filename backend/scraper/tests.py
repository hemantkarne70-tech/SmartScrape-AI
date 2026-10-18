from unittest.mock import patch, Mock
from django.test import TestCase
from rest_framework.test import APIClient
from .models import ScrapeJob, ScrapeRun
from .scraping import validate_public_url, ScrapeError

class URLValidationTests(TestCase):
    @patch("scraper.scraping.socket.getaddrinfo")
    def test_rejects_localhost(self, resolver):
        with self.assertRaises(ScrapeError):
            validate_public_url("http://localhost")
        resolver.assert_not_called()

    @patch("scraper.scraping.socket.getaddrinfo")
    def test_rejects_private_ip(self, resolver):
        resolver.return_value = [(None, None, None, None, ("192.168.1.2", 80))]
        with self.assertRaises(ScrapeError):
            validate_public_url("http://private.example")

class APITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")

    def test_create_job(self):
        response = self.client.post("/api/jobs/", {
            "name": "Example", "url": "https://example.com",
            "selectors": {"heading": "h1"}, "schedule": "manual",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ScrapeJob.objects.count(), 1)

    @patch("scraper.views.scrape_page")
    def test_scrape_endpoint_success(self, scrape_page):
        scrape_page.return_value = ({
            "url": "https://example.com", "status_code": 200, "page_title": "Example",
            "meta_description": "", "headings": {}, "links": [], "images": [],
            "custom": {"heading": ["Example"]}, "stats": {"elapsed_ms": 10},
        }, 10)
        response = self.client.post("/api/scrape/", {"url": "https://example.com", "selectors": {"heading": "h1"}}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "success")
        self.assertEqual(ScrapeRun.objects.count(), 1)
