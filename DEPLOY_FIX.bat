@echo off
title DEPLOYING LocalBiz GH...
color 0A
cls

echo.
echo  Deploying LocalBiz GH to Firebase...
echo  (Using npx firebase-tools - bypasses app conflict)
echo.

cd /d "C:\Users\AMIN\Desktop\localbizgh"

echo  Running deploy now...
echo.

npx firebase-tools@15.8.0 deploy --only hosting

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  FAILED. Trying alternative method...
    echo.
    node "%APPDATA%\npm\node_modules\firebase-tools\bin\firebase.js" deploy --only hosting
)

echo.
echo  ============================================
echo   Done! Open Chrome Incognito (Ctrl+Shift+N)
echo   Go to: https://localbizgh.web.app
echo  ============================================
echo.
pause
