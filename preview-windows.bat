@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js and try again.
  pause
  exit /b 1
)

if not exist "node_modules\marked\package.json" (
  echo Preparing the local preview for first use...
  call npm ci
  if errorlevel 1 (
    echo Failed to install the preview dependency.
    pause
    exit /b 1
  )
)

echo Starting the Karustep local preview...
echo The browser will open automatically.
echo Press Ctrl+C in this window to stop the server.
echo.

call npm run preview:windows

if errorlevel 1 (
  echo.
  echo The preview server stopped with an error.
  pause
)
