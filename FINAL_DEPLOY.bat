@echo off
title FINAL DEPLOY
color 0A
cls

cd /d "C:\Users\AMIN\Desktop\localbizgh"

copy /Y "%~dp0App.jsx" "src\App.jsx" >nul
copy /Y "%~dp0firebase.js" "src\firebase.js" >nul

echo Building...
call npm run build

echo.
echo Deploying via firebase.cmd...
echo.

"C:\Users\AMIN\AppData\Roaming\npm\firebase.cmd" deploy --only hosting

echo.
pause
