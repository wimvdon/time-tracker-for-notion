@echo off
cd /d "%~dp0"

:: Genereer local.properties als die ontbreekt
if not exist "local.properties" (
    echo sdk.dir=%LOCALAPPDATA%\\Android\\Sdk> local.properties
    echo local.properties aangemaakt.
)

:: Locate Java — use JAVA_HOME if set, otherwise find Android Studio's bundled JDK
if not defined JAVA_HOME (
    if exist "%PROGRAMFILES%\Android\Android Studio\jbr\bin\java.exe" (
        set "JAVA_HOME=%PROGRAMFILES%\Android\Android Studio\jbr"
    ) else if exist "%PROGRAMFILES%\Android\Android Studio\jre\bin\java.exe" (
        set "JAVA_HOME=%PROGRAMFILES%\Android\Android Studio\jre"
    )
)
if defined JAVA_HOME (
    set "PATH=%JAVA_HOME%\bin;%PATH%"
) else (
    echo ERROR: Java not found. Make sure Android Studio is installed, or set JAVA_HOME manually.
    pause
    exit /b 1
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
