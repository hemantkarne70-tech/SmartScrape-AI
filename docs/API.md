# API examples

Base URL: `http://127.0.0.1:8000/api`

## Preview a page

```bash
curl -X POST http://127.0.0.1:8000/api/scrape/ \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "selectors": {"main_heading": "h1", "all_links": "a"}
  }'
```

## Create a reusable job

```json
{
  "name": "Example homepage",
  "url": "https://example.com",
  "selectors": {"main_heading": "h1"},
  "schedule": "manual",
  "is_active": true
}
```

Send this to `POST /api/jobs/`.

## Run a job

`POST /api/jobs/{id}/run/`

## Export

`GET /api/runs/{id}/export/?format=json` or `?format=csv`.
