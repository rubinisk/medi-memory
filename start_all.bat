@echo off
rem Opens the backend and frontend in two separate windows.
cd /d "%~dp0"
start "MediMemory backend" cmd /k call "%~dp0start_backend.bat"
timeout /t 4 /nobreak >nul
start "MediMemory frontend" cmd /k call "%~dp0start_frontend.bat"
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
