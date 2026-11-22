@echo off
rem Deletes and recreates the fictional demo accounts and their records.
cd /d "%~dp0..\backend"
if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Run setup.bat first.
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m app.seed --reset
if errorlevel 1 (
  echo [ERROR] Resetting demo data failed.
)
pause
