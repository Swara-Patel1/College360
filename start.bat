@echo off
title EduPulse - College Management System
color 0A
echo.
echo  =============================================
echo   EduPulse - College Management System
echo  =============================================
echo.
echo  Starting all services...
echo.

:: ── 1. Django Backend (Data API + AI Chatbot on port 8000) ──
start "Django Backend (Port 8000)" cmd /k "cd /d %~dp0backend && python manage.py runserver 8000"

:: Wait for Django to start
timeout /t 3 /nobreak > nul

:: ── 2. React Frontend (Vite on port 5173) ──
start "React Frontend (Vite)" cmd /k "cd /d %~dp0edumanage_frontend && npm run dev"

:: Wait for frontend to spin up
timeout /t 4 /nobreak > nul

:: ── 3. Open browser ──
start "" "http://localhost:5173"

echo.
echo  =============================================
echo   All services started!
echo  =============================================
echo.
echo  Services:
echo    Django Backend:  http://localhost:8000  (DRF + SQLite + AI Chatbot)
echo    React Frontend:  http://localhost:5173
echo.
echo  Django Admin:    http://localhost:8000/admin/
echo    Username: admin_lju   Password: admin123
echo.
echo  Demo Login Credentials:
echo    Admin:   admin@lju.edu.in   /  admin123
echo    Faculty: faculty1@lju.edu.in /  fac123
echo    Student: rushi@lju.edu.in   /  rushi123
echo.
echo  Note: backend-node (MongoDB) is no longer needed.
echo        Django now serves all data via DRF + SQLite.
echo.
pause
