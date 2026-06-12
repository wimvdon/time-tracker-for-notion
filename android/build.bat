@echo off
cd /d "%~dp0"

:: Genereer local.properties als die ontbreekt
if not exist "local.properties" (
    echo sdk.dir=%LOCALAPPDATA%\\Android\\Sdk> local.properties
    echo local.properties aangemaakt.
)

echo.
echo Building APK...
echo.

call gradlew.bat assembleDebug
set BUILD_ERROR=%errorlevel%

echo.
if %BUILD_ERROR% neq 0 (
    echo Build MISLUKT met foutcode %BUILD_ERROR%.
    pause
    exit /b %BUILD_ERROR%
)

if not exist "..\release" mkdir "..\release"
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "..\release\NotionTimeTracker.apk" >nul

echo Klaar! APK staat in:
echo   release\NotionTimeTracker.apk
echo.
echo Kopieer dit naar je toestel om te installeren.
echo.
pause
