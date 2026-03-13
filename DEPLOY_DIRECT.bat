@echo off
title DEPLOYING - Direct Method
color 0A
cls
cd /d "C:\Users\AMIN\Desktop\localbizgh"

echo Deploying via Node.js directly...
echo.

node "%APPDATA%\npm\node_modules\firebase-tools\bin\firebase.js" deploy --only hosting

echo.
pause
