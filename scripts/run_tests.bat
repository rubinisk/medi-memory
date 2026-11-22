@echo off
rem Runs the backend (pytest) and frontend (vitest) test suites.
setlocal
cd /d "%~dp0..\backend"
if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Run setup.bat first.
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"
echo === Backend tests ===
python -m pytest -q
set BACKEND_RESULT=%errorlevel%
call deactivate >nul 2>&1
cd /d "%~dp0..\frontend"
echo.
echo === Frontend tests ===
call npm test
set FRONTEND_RESULT=%errorlevel%
echo.
echo Backend tests exit code:  %BACKEND_RESULT%
echo Frontend tests exit code: %FRONTEND_RESULT%   (0 = passed)
pause
