@echo off
cd /d "%~dp0backend"
if not exist .venv\Scripts\python.exe (
  echo Creating Python virtual environment...
  py -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if not exist .env copy .env.example .env
python manage.py migrate
python manage.py runserver
