@echo off
rem Starts the Grad2Tech website + portal on this PC (local demo).
rem Keep the windows that open; closing them stops the site.
cd /d "%~dp0"
set TEMP=D:\tmp
set TMP=D:\tmp
set NEXT_TELEMETRY_DISABLED=1

echo Starting the database...
start "Grad2Tech database" cmd /k "npm run db:local"
timeout /t 8 /nobreak >nul

echo Starting the website...
start "Grad2Tech website" cmd /k "npm run dev"
timeout /t 15 /nobreak >nul

echo Starting background jobs...
start "Grad2Tech worker" cmd /k "npm run worker"

echo Opening the portal in your browser...
start "" http://localhost:3000/portal
echo.
echo Website:  http://localhost:3000
echo Portal:   http://localhost:3000/portal
echo Admin:    admin@gmail.com / 123456
echo Student:  student@gmail.com / 12345
echo.
pause
