@echo off
title Get Firebase Token
color 0A
cls
cd /d "C:\Users\AMIN\Desktop\localbizgh"

echo.
echo  This will open your browser to log in to Firebase.
echo  After login, a TOKEN will appear in this window.
echo  Copy it and paste into DEPLOY_WITH_TOKEN.bat
echo.

node -e "require('C:\\Users\\AMIN\\AppData\\Roaming\\npm\\node_modules\\firebase-tools').login.ci().then(t=>{ console.log('\n\n=== YOUR TOKEN (copy everything below) ===\n'); console.log(t); console.log('\n=== END TOKEN ===\n'); }).catch(e=>console.log('Error:',e.message))"

echo.
echo Copy the token above, open DEPLOY_WITH_TOKEN.bat and paste it in.
pause
