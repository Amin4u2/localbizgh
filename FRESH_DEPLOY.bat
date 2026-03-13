@echo off
title FRESH DEPLOY - LocalBiz GH
color 0E
cls

echo.
echo  ============================================
echo   FRESH DEPLOY - LocalBiz GH
echo   AMTECH SOFTWARE SOLUTIONS
echo  ============================================
echo.

:: Go to project
cd /d "C:\Users\AMIN\Desktop\localbizgh"

:: STEP 1 - Copy new source files
echo  STEP 1: Copying new files...
copy /Y "%~dp0App.jsx" "src\App.jsx"
echo  Copied App.jsx:
type "src\App.jsx" | find /c "AMTECH SOFTWARE SOLUTIONS"
echo  (number above should be 13 or more)
echo.

copy /Y "%~dp0firebase.js" "src\firebase.js"
echo  Copied firebase.js.
echo.

:: STEP 2 - Delete old dist completely
echo  STEP 2: Deleting old build...
if exist "dist" (
    rmdir /s /q "dist"
    echo  Old dist folder deleted.
) else (
    echo  No old dist found, continuing.
)
echo.

:: STEP 3 - Fresh build
echo  STEP 3: Building fresh (60 seconds)...
echo.
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  BUILD FAILED. Try running: npm install
    pause
    exit /b 1
)
echo.
echo  Build complete.
echo.

:: STEP 4 - Verify AMTECH is in the built file
echo  STEP 4: Verifying new code is in build...
findstr /r "AMTECH" "dist\assets\*.js" >nul 2>&1
if %errorlevel% equ 0 (
    echo  VERIFIED: AMTECH found in built files.
) else (
    color 0C
    echo  WARNING: AMTECH not found in build.
    echo  The copy may have failed.
)
echo.

:: STEP 5 - Deploy
echo  STEP 5: Deploying to Firebase...
echo.
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  DEPLOY FAILED. Try: firebase login
    pause
    exit /b 1
)

color 0A
cls
echo.
echo  ============================================
echo   DEPLOY COMPLETE - Site is LIVE
echo  ============================================
echo.
echo  Press Ctrl+Shift+R in your browser NOW.
echo.
echo  You will see an AMBER BAR at the top:
echo  "AMTECH SOFTWARE SOLUTIONS - LocalBiz v5.0"
echo.
echo  If you still see the old site after 
echo  Ctrl+Shift+R, try opening in Incognito:
echo  Press Ctrl+Shift+N in Chrome
echo  Then go to: https://localbizgh.web.app
echo  ============================================
echo.
pause
