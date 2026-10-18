@echo off
cd /d "%~dp0backend"
if not exist .venv\Scripts\python.exe (
  echo Create the backend environment first by running start_backend.bat.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python manage.py run_scheduler
