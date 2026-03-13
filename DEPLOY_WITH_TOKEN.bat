@echo off
title Deploy with Token
color 0A
cls
cd /d "C:\Users\AMIN\Desktop\localbizgh"

echo.
echo  PASTE YOUR TOKEN below and press Enter:
echo  (Token starts with 1// and is very long)
echo.
set /p TOKEN="Token: "

echo.
echo  Deploying now...
echo.

set FIREBASE_TOKEN=%TOKEN%
node deploy.cjs

pause
