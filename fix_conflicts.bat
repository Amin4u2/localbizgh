@echo off
title Fix Git Conflicts
color 0A
cls

cd /d "%USERPROFILE%\Desktop\localbizgh"

echo Aborting rebase...
git rebase --abort

echo.
echo Resetting to GitHub version...
git fetch origin
git reset --hard origin/main

echo.
echo Re-applying your latest App.jsx...
copy /Y "%USERPROFILE%\Downloads\App.jsx" src\App.jsx

echo.
echo Pushing to GitHub...
git add src\App.jsx
git commit -m "Fix subscription management"
git push origin main

if %errorlevel% neq 0 (
  color 0C
  echo [ERROR] Push failed.
  pause & exit /b 1
)

color 0A
echo.
echo ============================================================
echo  DONE! Check: https://github.com/Amin4u2/localbizgh/actions
echo ============================================================
pause
