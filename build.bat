@echo off
cd /d "%~dp0"
echo Building Electron app...
npm run make
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)
echo Done! Check the /out folder.
pause
