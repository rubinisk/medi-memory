@echo off
setlocal EnableExtensions
title MediMemory - backend (FastAPI)
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] The backend is not installed yet. Run setup.bat first.
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"

rem Apply any new migrations before starting
python -m alembic upgrade head
if errorlevel 1 (
  echo [ERROR] Database migration failed. Check DATABASE_URL in .env
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   MediMemory backend starting on http://127.0.0.1:8000
echo   API documentation:      http://127.0.0.1:8000/docs
echo   Keep this window open. Press Ctrl+C to stop.
echo ============================================================
echo.
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
echo.
echo [INFO] The backend has stopped. If you didn't stop it yourself, read the error above.
echo        Port 8000 already in use? Close the other backend window and try again.
pause
