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
echo  - Real-time:    http://localhost:3001
echo  - Frontend:     http://localhost:5173
echo.
echo  Demo Credentials:
echo  Admin:   admin / admin123
echo  Hod: hod@lju.edu.in / hod123
echo  Faculty: fac@lju.edu.in / fac123
echo  Student: rushi@lju.edu.in / rushi123
echo.
pause
