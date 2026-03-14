@echo off
title Fix Node Version
color 0A
cls

echo.
echo  Fixing Node version in functions/package.json...
echo.

cd /d "%USERPROFILE%\Desktop\localbizgh"

:: Write the correct package.json directly
(
echo {
echo   "name": "localbizgh-functions",
echo   "description": "LocalBiz GH Firebase Cloud Functions",
echo   "scripts": {
echo     "serve": "firebase emulators:start --only functions",
echo     "deploy": "firebase deploy --only functions"
echo   },
echo   "engines": {
echo     "node": "20"
echo   },
echo   "main": "index.js",
echo   "dependencies": {
echo     "firebase-admin": "^12.0.0",
echo     "firebase-functions": "^4.0.0"
echo   },
echo   "devDependencies": {
echo     "firebase-functions-test": "^3.0.0"
echo   },
echo   "private": true
echo }
) > functions\package.json

echo  [OK] package.json updated to Node 20
echo.

:: Verify
echo  Verifying...
findstr "node" functions\package.json
echo.

:: Push to GitHub
echo  Pushing to GitHub...
git add functions\package.json
git commit -m "Upgrade functions runtime to Node 20"
git push origin main

if %errorlevel% neq 0 (
  color 0C
  echo  [ERROR] Push failed.
  pause & exit /b 1
)

color 0A
echo.
echo  ============================================================
echo   DONE! Check deployment at:
echo   https://github.com/Amin4u2/localbizgh/actions
echo  ============================================================
echo.
pause
