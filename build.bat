@echo off
cd /d "%~dp0"
echo Building Electron app...
echo.

call npm run dist
set BUILD_ERROR=%errorlevel%

echo.
if %BUILD_ERROR% neq 0 (
    echo Build FAILED with error code %BUILD_ERROR%
) else (
    echo Done! Check the /release folder.
)

pause
