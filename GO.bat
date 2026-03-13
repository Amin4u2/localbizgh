@echo off
title LocalBiz GH - Deploy
color 0A
cls

cd /d "C:\Users\AMIN\Desktop\localbizgh"

echo Copying files...
copy /Y "%~dp0App.jsx" "src\App.jsx" >nul
copy /Y "%~dp0firebase.js" "src\firebase.js" >nul

echo Building...
call npm run build

echo.
echo Deploying using Node directly (bypassing Firebase Studio)...
echo.

node "C:\Users\AMIN\AppData\Roaming\npm\node_modules\firebase-tools\bin\firebase.js" deploy --only hosting

echo.
echo If you see "Deploy complete" above, press Ctrl+Shift+N in Chrome
echo and go to https://localbizgh.web.app
echo.
pause
