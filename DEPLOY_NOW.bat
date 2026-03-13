@echo off
title LOCALBIZ GH - DEPLOYING...
color 0A
cls

echo.
echo  ==========================================
echo   LOCALBIZ GH ^| AMTECH SOFTWARE SOLUTIONS
echo   Deploying new version to the internet...
echo  ==========================================
echo.

:: ── Step 0: Go to project folder
cd /d "C:\Users\AMIN\Desktop\localbizgh"
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Project folder not found at:
    echo  C:\Users\AMIN\Desktop\localbizgh
    echo.
    echo  Check the folder path and try again.
    pause
    exit /b 1
)
echo  [OK] Found project folder.

:: ── Step 1: Copy the new files into src\
echo  [1/3] Copying updated files into src\...
copy /Y "%~dp0App.jsx" "src\App.jsx" >nul
copy /Y "%~dp0firebase.js" "src\firebase.js" >nul
echo  [OK] Files copied.
echo.

:: ── Step 2: Build
echo  [2/3] Building app (takes ~60 seconds, please wait)...
echo.
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  BUILD FAILED. Read the red error above.
    echo  Common fix: run "npm install" first, then try again.
    pause
    exit /b 1
)
echo.
echo  [OK] Build successful.
echo.

:: ── Step 3: Deploy to Firebase
echo  [3/3] Uploading to Firebase (internet required)...
echo.
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  DEPLOY FAILED. Common fixes:
    echo  - Run "firebase login" in a separate command prompt
    echo  - Check your internet connection
    pause
    exit /b 1
)

:: ── Done
color 0A
cls
echo.
echo  ==========================================
echo   SUCCESS! New code is now LIVE.
echo  ==========================================
echo.
echo  NOW do this in your browser:
echo.
echo    Press:  Ctrl + Shift + R
echo    (Hold Ctrl and Shift, then press R)
echo.
echo  You will see an amber bar at the top:
echo  "AMTECH SOFTWARE SOLUTIONS - LocalBiz v5.0"
echo.
echo  That confirms the new code is working.
echo  ==========================================
echo.
pause
