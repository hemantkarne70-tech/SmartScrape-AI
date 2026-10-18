import csv
import io
import json
from django.db.models import Count
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from .models import ScrapeJob, ScrapeRun
from .scraping import scrape_page, ScrapeError
from .serializers import ScrapeJobSerializer, ScrapeRunSerializer, ScrapeRequestSerializer

def execute_scrape(url, selectors=None, job=None):
    try:
        result, duration = scrape_page(url, selectors or {})
        run = ScrapeRun.objects.create(
            job=job, url=result["url"], status="success", result=result,
            duration_ms=duration, records_count=sum(len(v) for v in result.get("custom", {}).values()),
        )
    except Exception as exc:
        run = ScrapeRun.objects.create(
            job=job, url=url, status="failed", error=str(exc)[:4000],
            duration_ms=0, records_count=0,
        )
    if job:
        job.last_run_at = timezone.now()
        job.save(update_fields=["last_run_at", "updated_at"])
    return run

@api_view(["GET"])
def health(request):
    return Response({"status": "ok", "service": "SmartScrape AI API"})

@api_view(["POST"])
def scrape_now(request):
    serializer = ScrapeRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    run = execute_scrape(data["url"], data.get("selectors", {}))
    payload = ScrapeRunSerializer(run).data
    if run.status == "failed":
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)
    return Response(payload, status=status.HTTP_201_CREATED)

class JobViewSet(viewsets.ModelViewSet):
    queryset = ScrapeJob.objects.annotate(run_count=Count("runs")).all()
    serializer_class = ScrapeJobSerializer

    @action(detail=True, methods=["post"])
    def run(self, request, pk=None):
        job = self.get_object()
        run = execute_scrape(job.url, job.selectors, job=job)
        payload = ScrapeRunSerializer(run).data
        return Response(payload, status=status.HTTP_201_CREATED if run.status == "success" else status.HTTP_400_BAD_REQUEST)

class RunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ScrapeRun.objects.select_related("job").all()
    serializer_class = ScrapeRunSerializer

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        run = self.get_object()
        fmt = request.query_params.get("format", "json").lower()
        if fmt == "json":
            response = HttpResponse(json.dumps(run.result, indent=2, ensure_ascii=False), content_type="application/json; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="smartscrape-run-{run.id}.json"'
            return response
        if fmt == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["section", "field", "value"])
            result = run.result or {}
            for key in ("page_title", "meta_description", "url", "status_code"):
                writer.writerow(["page", key, result.get(key, "")])
            for section in ("headings", "custom"):
                for field, values in result.get(section, {}).items():
                    for value in values:
                        writer.writerow([section, field, value])
            for field in ("links", "images"):
                for item in result.get(field, []):
                    writer.writerow([field, "text" if field == "links" else "alt", item.get("text", item.get("alt", ""))])
                    writer.writerow([field, "url", item.get("url", "")])
            response = HttpResponse("\ufeff" + output.getvalue(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="smartscrape-run-{run.id}.csv"'
            return response
        return Response({"detail": "Unsupported format. Use json or csv."}, status=400)
