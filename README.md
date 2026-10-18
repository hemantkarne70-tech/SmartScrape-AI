# SmartScrape AI

A ready-to-run web scraping dashboard built with **React + Vite** and **Django REST Framework**, powered by **Beautiful Soup 4**.

SmartScrape AI lets you scrape public pages, configure CSS selectors, preview structured results, save reusable jobs, review run history, and export data as JSON or CSV. It includes URL safety checks, timeouts, request throttling, and automated scheduled jobs through a lightweight scheduler command.

> Use responsibly: scrape only websites you are authorized to access. Respect site terms, robots.txt, copyright, rate limits, and applicable law. Do not use this tool to bypass logins, CAPTCHAs, paywalls, or other access controls.

## Features

- Responsive dashboard with overview metrics and recent activity
- One-off scraping by URL with configurable CSS selectors
- Default extraction for page title, meta description, headings, links, and images
- Save reusable scraping jobs and run them again
- Run history, error messages, and timestamps
- Export results as JSON or CSV
- Optional recurring jobs (`every_15_minutes`, `hourly`, `daily`) with scheduler process
- Django admin for inspecting jobs and runs
- SQLite by default; environment-based configuration
- URL validation and protection against localhost/private-network targets
- Backend tests and frontend build scripts

## Architecture

```text
SmartScrape-AI/
├── backend/              Django REST API + Beautiful Soup scraper
├── frontend/             React + Vite dashboard
├── docs/                 Usage and API notes
├── .env.example
├── docker-compose.yml
└── README.md
```

## Requirements

- Python 3.10+
- Node.js 20+ and npm
- Git (for publishing)

## Run locally on Windows

### 1. Clone the repository

```powershell
git clone https://github.com/hemantkarne70-tech/SmartScrape-AI.git
cd SmartScrape-AI
```

If you are creating the repository locally for the first time, copy these files into your repository folder instead.

### 2. Start the backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API: `http://127.0.0.1:8000/api/`  
Admin: `http://127.0.0.1:8000/admin/`

### 2a. Enable recurring schedules (required)

Keep the scheduler running in a **third terminal** for `Every 15 minutes`, `Hourly`, and `Daily` jobs to execute automatically. After the backend environment has been set up, run:

```powershell
cd SmartScrape-AI
.\start_scheduler.bat
```

The scheduler checks active recurring jobs every 30 seconds. `Manual only` jobs run only when you press the Run button. Keep the scheduler terminal open while using local development. With Docker, `docker compose up --build` starts the scheduler service alongside the API and frontend.

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal and activate again.

### 3. Start the frontend

Open a second terminal:

```powershell
cd SmartScrape-AI\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

### Linux/macOS backend activation

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

Then in another terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## How to use

1. Open **New scrape**.
2. Enter a public HTTP/HTTPS URL.
3. Optionally add CSS selectors, one per field, such as:
   - `price: .price`
   - `product_name: h1`
   - `cards: .product-card`
4. Select **Preview scrape** to fetch and parse the page.
5. Save the configuration as a reusable job if needed.
6. Open Jobs to run it again or configure a recurring schedule.
7. Export result data as JSON or CSV.

The preview endpoint returns common metadata and user-defined selector values. Selector values are returned as text, with a limited number of matches per selector to keep responses manageable.

## Scheduled jobs

Start the scheduler in a separate backend terminal:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py run_scheduler
```

Keep this process running for recurring jobs. For production, run it as a supervised worker/service rather than relying on a terminal session. Schedule choices are `manual`, `every_15_minutes`, `hourly`, and `daily`.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health/` | API health check |
| POST | `/api/scrape/` | Run a one-off scrape |
| GET/POST | `/api/jobs/` | List or create saved jobs |
| GET/PATCH/DELETE | `/api/jobs/{id}/` | Read/update/delete a job |
| POST | `/api/jobs/{id}/run/` | Run a saved job |
| GET | `/api/runs/` | Recent run history |
| GET | `/api/runs/{id}/export/?format=json` | Export run data as JSON |
| GET | `/api/runs/{id}/export/?format=csv` | Export tabular results as CSV |

See [`docs/API.md`](docs/API.md) for examples.

## Tests

Backend:

```bash
cd backend
python manage.py test
```

Frontend production build:

```bash
cd frontend
npm install
npm run build
```

## Docker (optional)

```bash
docker compose up --build
```

The frontend is served by Vite on port 5173 and the API on port 8000. The Compose setup is intended for local development, not hardened production deployment.

## GitHub publishing

If the GitHub repository already exists and contains a README or license, fetch it before pushing to avoid a non-fast-forward rejection.

```bash
git init
git add .
git commit -m "Initial SmartScrape AI application"
git branch -M main
git remote add origin https://github.com/hemantkarne70-tech/SmartScrape-AI.git
git pull origin main --allow-unrelated-histories
# Resolve any conflicts, then:
git add .
git commit -m "Merge remote repository files"   # only if Git reports a merge in progress
git push -u origin main
```

If `origin` already exists, inspect it with `git remote -v` rather than adding it again. If you cloned the repository first, simply copy the project files into that clone, then `git add`, `commit`, and `push`.

**This package has not been pushed to GitHub by the assistant.** Run the commands above from your own authenticated Git environment. Never commit `.env`, credentials, database files, virtual environments, or `node_modules`.

## Notes and limitations

- Beautiful Soup parses HTML; it does not run page JavaScript. Use an authorized static HTML endpoint or add a browser automation adapter for dynamic pages.
- CSS selector extraction uses Beautiful Soup's SoupSieve support.
- URL safety checks reduce SSRF risk but do not replace network-level egress restrictions in production.
- Scraping success depends on the target site's HTML structure and policies.

## Windows quick-start scripts

After extracting the ZIP, double-click `start_backend.bat` and then `start_frontend.bat` in separate terminals. The first run creates the Python virtual environment and installs dependencies. Internet access is required for initial package installation.
