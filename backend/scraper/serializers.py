from rest_framework import serializers
from .models import ScrapeJob, ScrapeRun, SCHEDULE_CHOICES

class ScrapeJobSerializer(serializers.ModelSerializer):
    run_count = serializers.IntegerField(read_only=True, default=0)
    class Meta:
        model = ScrapeJob
        fields = ["id", "name", "url", "selectors", "schedule", "is_active", "last_run_at", "created_at", "updated_at", "run_count"]
        read_only_fields = ["id", "last_run_at", "created_at", "updated_at", "run_count"]

    def validate_selectors(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Selectors must be an object mapping field names to CSS selectors.")
        if len(value) > 30:
            raise serializers.ValidationError("Use 30 or fewer custom selectors.")
        return value

class ScrapeRunSerializer(serializers.ModelSerializer):
    job_name = serializers.CharField(source="job.name", read_only=True, default="")
    class Meta:
        model = ScrapeRun
        fields = ["id", "job", "job_name", "url", "status", "result", "error", "duration_ms", "records_count", "created_at"]
        read_only_fields = fields

class ScrapeRequestSerializer(serializers.Serializer):
    url = serializers.URLField(max_length=2048)
    selectors = serializers.DictField(child=serializers.CharField(max_length=500), required=False, default=dict)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
