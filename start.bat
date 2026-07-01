@echo off
title EduPulse - College Management System
color 0A
echo.
echo  ================================
echo   EduPulse - College Management
echo  ================================
echo.
echo  Starting all services...
echo.

:: Start Django Backend (DISABLED - Django replaced by Supabase)
:: start "Django Backend (Port 8000)" cmd /k "cd /d %~dp0backend && python manage.py runserver 0.0.0.0:8000"


:: Wait a moment
timeout /t 3 /nobreak > nul

:: Start Node.js Real-time Server
start "Node.js Real-time (Port 3001)" cmd /k "cd /d %~dp0realtime && node server.js"

:: Wait a moment
timeout /t 2 /nobreak > nul

:: Start Frontend HTTP Server (fixes file:// CORS issue)
start "Frontend HTTP Server (Port 5500)" cmd /k "python -m http.server 5500 --directory %~dp0frontend"

:: Wait for server to start
timeout /t 2 /nobreak > nul

:: Open the frontend via HTTP (NOT file://)
start "" "http://localhost:5500/index.html"

echo.
echo  All services started!
echo  - Django API:   http://127.0.0.1:8000/api/
echo  - Real-time:    http://localhost:3001
echo  - Frontend:     http://localhost:5500/index.html
echo.
echo  Demo Credentials:
echo  Admin:   admin / admin123
echo  Faculty: rajesh.kumar / faculty123
echo  Student: arjun.verma / student123
echo.
pause
