@echo off
setlocal EnableExtensions
title MediMemory - frontend (Vite)
cd /d "%~dp0frontend"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo [INFO] Frontend packages are missing. Installing now...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo   MediMemory web app starting on http://localhost:5173
echo   Make sure start_backend.bat is running in another window.
echo   Keep this window open. Press Ctrl+C to stop.
echo ============================================================
echo.
call npm run dev
echo.
echo [INFO] The frontend has stopped. If you didn't stop it yourself, read the error above.
pause
