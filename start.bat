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

:: Data API (MongoDB) runs as the Windows service "College360 API" and auto-starts on boot.
:: Ensure it's running (harmless if already started):
net start "college360api.exe" >nul 2>&1

:: Start Django Backend (AI chatbot API on port 8000)
start "Django Chatbot API (Port 8000)" cmd /k "cd /d %~dp0backend && python manage.py runserver 8000"

:: Start Node.js Real-time Server
start "Node.js Real-time (Port 3001)" cmd /k "cd /d %~dp0realtime && npm run dev"

:: Wait a moment
timeout /t 2 /nobreak > nul

:: Start React Frontend (Vite)
start "React Frontend (Vite)" cmd /k "cd /d %~dp0edumanage_frontend && npm run dev"

:: Wait for frontend to spin up
timeout /t 3 /nobreak > nul

:: Open the frontend in browser
start "" "http://localhost:5173"

echo.
echo  All services started!
echo  - Data API:     http://localhost:4000  (MongoDB - Windows service, auto-start)
echo  - Chatbot API:  http://localhost:8000  (Django - AI assistant)
echo  - Real-time:    http://localhost:3001
echo  - Frontend:     http://localhost:5173
echo.
echo  Demo Credentials:
echo  Admin:   admin@lju.edu.in / admin123
echo  Hod: hod@lju.edu.in / hod123
echo  Faculty: fac@lju.edu.in / fac123
echo  Student: rushi@lju.edu.in / rushi123
echo.
pause
