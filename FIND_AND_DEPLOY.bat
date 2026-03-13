@echo off
title Finding Firebase and Deploying
color 0A
cls

cd /d "C:\Users\AMIN\Desktop\localbizgh"

copy /Y "%~dp0App.jsx" "src\App.jsx" >nul
copy /Y "%~dp0firebase.js" "src\firebase.js" >nul

echo Building...
call npm run build
echo.

echo Searching for firebase-tools...
echo.

:: Find where firebase command actually lives
where firebase 2>nul
for /f "tokens=*" %%i in ('where firebase 2^>nul') do set FBPATH=%%i

if defined FBPATH (
    echo Found firebase at: %FBPATH%
    echo.
    :: Get the actual .js file next to it
    for %%i in ("%FBPATH%") do set FBDIR=%%~dpi
    echo Firebase dir: %FBDIR%
    
    :: Try running it directly with node
    if exist "%FBDIR%firebase" (
        node "%FBDIR%firebase" deploy --only hosting
    ) else (
        echo Running: %FBPATH%
        "%FBPATH%" deploy --only hosting
    )
) else (
    echo firebase not found via WHERE, searching manually...
    
    :: Search common locations
    for %%p in (
        "C:\Users\AMIN\AppData\Roaming\npm\firebase"
        "C:\Users\AMIN\AppData\Local\npm\firebase"  
        "C:\Program Files\nodejs\firebase"
        "C:\Program Files (x86)\nodejs\firebase"
        "C:\Users\AMIN\AppData\Roaming\nvm\current\firebase"
    ) do (
        if exist %%p (
            echo Found at %%p
            node %%p deploy --only hosting
            goto :done
        )
    )
    
    echo.
    echo Could not find firebase. Showing installed npm packages:
    npm list -g --depth=0
)

:done
echo.
pause
