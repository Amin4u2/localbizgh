@echo off
title LocalBiz GH - Push to Deploy
color 0A
cls

echo.
echo  ============================================================
echo    LocalBiz GH  ^|  Push Changes to Deploy
echo    Changes go live at: https://localbizgh.web.app
echo  ============================================================
echo.

cd /d "%USERPROFILE%\Desktop\localbizgh"

echo  What changes did you make? (press Enter to skip)
set /p MSG=  Description: 
if "%MSG%"=="" set MSG=Update app

echo.
echo  Saving changes...
git add .

git diff --cached --quiet
if %errorlevel% equ 0 (
  color 0E
  echo  No new changes to deploy.
  echo  Your site is already up to date.
  echo.
  pause & exit /b 0
)

git commit -m "%MSG%"
echo.
echo  Uploading to GitHub...
git push origin main

if %errorlevel% neq 0 (
  color 0C
  echo.
  echo  [ERROR] Push failed. Check your internet connection.
  pause & exit /b 1
)

color 0A
echo.
echo  ============================================================
echo    DONE! Deployment started automatically.
echo.
echo    Watch progress:
echo    https://github.com/Amin4u2/localbizgh/actions
echo.
echo    Live site (ready in ~2 min):
echo    https://localbizgh.web.app
echo  ============================================================
echo.
pause >nul
