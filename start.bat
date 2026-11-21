@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=3000"
set "URL=http://localhost:%PORT%/"
title Agrolane Launcher

echo ==========================================
echo   Agrolane - County Agri Match Server
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo         Install Node.js 22.5 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

set "HAS_CURL=1"
where curl >nul 2>nul
if errorlevel 1 set "HAS_CURL="

if not exist "node_modules\express" (
  echo [1/3] Installing dependencies, first run only...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :install_fail
) else (
  echo [1/3] Dependencies OK.
)

echo [2/3] Checking port %PORT% ...
set "BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do set "BUSY=%%p"

if defined BUSY (
  if defined HAS_CURL (
    set "ALIVE="
    for /f %%c in ('curl -s -o nul -w "%%{http_code}" "%URL%api/health" 2^>nul') do set "ALIVE=%%c"
    if /i "!ALIVE!"=="200" (
      echo       Server is already running.
      goto :open
    )
  ) else (
    echo       Port %PORT% is busy, assume server is running.
    goto :open
  )
  echo [ERROR] Port %PORT% is occupied by another program, PID=!BUSY!
  echo         Close it first, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "logs" mkdir "logs"
echo       Starting server window ^(minimized, log: logs\server.log^)...
start "Agrolane Server" /min cmd /c "node --disable-warning=ExperimentalWarning server\index.js > logs\server.log 2>&1"

echo [3/3] Waiting for server to be ready...
if not defined HAS_CURL (
  ping -n 4 127.0.0.1 >nul
  goto :open
)

set /a TRIES=0
:wait
set /a TRIES+=1
set "ALIVE="
for /f %%c in ('curl -s -o nul -w "%%{http_code}" "%URL%api/health" 2^>nul') do set "ALIVE=%%c"
if /i "!ALIVE!"=="200" goto :open
if !TRIES! GEQ 30 goto :timeout
ping -n 2 127.0.0.1 >nul
goto :wait

:open
echo.
echo       Ready: %URL%
echo       To stop: close the minimized window "Agrolane Server".
start "" "%URL%"
ping -n 3 127.0.0.1 >nul
exit /b 0

:timeout
echo.
echo [ERROR] Server did not respond within 30 seconds.
echo         Check logs\server.log, or run "npm start" in this folder.
echo.
pause
exit /b 1

:install_fail
echo.
echo [ERROR] npm install failed. Check your network or npm proxy settings.
echo.
pause
exit /b 1
