@echo off
setlocal EnableExtensions

rem Install locked dependencies and build xi-web while its service is stopped.
rem Run this file from an elevated Command Prompt.
set "APP_NAME=xi-web"
set "APP_DIR=D:\new\xi-web"
set "NSSM_EXE=D:\new\nssm-2.24\win64\nssm.exe"
set "NPM_REGISTRY=https://registry.npmmirror.com/"

fltmc >nul 2>&1
if errorlevel 1 (
  echo ERROR: Run this script as Administrator.
  pause
  exit /b 1
)

if not exist "%NSSM_EXE%" (
  echo ERROR: NSSM was not found at "%NSSM_EXE%".
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm.cmd was not found.
  pause
  exit /b 1
)

if not exist "%APP_DIR%\.env.production" (
  echo ERROR: Missing %APP_DIR%\.env.production
  pause
  exit /b 1
)

sc query "%APP_NAME%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: %APP_NAME% service does not exist.
  pause
  exit /b 1
)

sc query "%APP_NAME%" | findstr /i /c:"STOPPED" >nul
if errorlevel 1 (
  echo ERROR: %APP_NAME% must be stopped first. Run stop-xi-web-service.bat.
  pause
  exit /b 1
)

pushd "%APP_DIR%"
if errorlevel 1 (
  echo ERROR: Cannot open %APP_DIR%.
  pause
  exit /b 1
)
echo Installing locked dependencies with npm ci from %NPM_REGISTRY%...
call npm.cmd ci --registry="%NPM_REGISTRY%" --replace-registry-host=always
if errorlevel 1 goto :update_error

echo Building with .env.production...
call npm.cmd run build
if errorlevel 1 goto :update_error
popd

echo Update completed. Run start-xi-web-service.bat when ready.
pause
exit /b 0

:update_error
popd
echo ERROR: Update failed. %APP_NAME% remains stopped.
pause
exit /b 1
