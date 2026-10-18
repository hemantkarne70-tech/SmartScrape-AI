from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import health, scrape_now, JobViewSet, RunViewSet

router = DefaultRouter()
router.register("jobs", JobViewSet, basename="job")
router.register("runs", RunViewSet, basename="run")

urlpatterns = [
    path("health/", health, name="health"),
    path("scrape/", scrape_now, name="scrape-now"),
    path("", include(router.urls)),
]
