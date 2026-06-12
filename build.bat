@echo off
cd /d "%~dp0"
echo Building Electron app...
npm run dist
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)
echo Done! Check the /release folder.
pause
