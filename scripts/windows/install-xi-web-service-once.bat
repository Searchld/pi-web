@echo off
setlocal EnableExtensions

rem One-time installation of the xi-web NSSM service after it was removed.
rem Run this file from an elevated Command Prompt.
set "APP_NAME=xi-web"
set "APP_DIR=D:\new\xi-web"
set "PORT=30141"
set "NODE_EXE=D:\PROGRAM FILES\NODEJS\node.exe"
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

if not exist "%NODE_EXE%" (
  echo ERROR: Node.js was not found at "%NODE_EXE%".
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
if not errorlevel 1 (
  echo ERROR: %APP_NAME% already exists. Use the stop, update, and start scripts instead.
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
if errorlevel 1 goto :install_error

echo Building with .env.production...
call npm.cmd run build
if errorlevel 1 goto :install_error
popd

if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"
echo Creating %APP_NAME% service...
"%NSSM_EXE%" install "%APP_NAME%" "%NODE_EXE%" "node_modules\next\dist\bin\next start -H 127.0.0.1 -p %PORT%"
if errorlevel 1 goto :service_error

"%NSSM_EXE%" set "%APP_NAME%" AppDirectory "%APP_DIR%"
"%NSSM_EXE%" set "%APP_NAME%" AppEnvironmentExtra "NODE_ENV=production"
"%NSSM_EXE%" set "%APP_NAME%" AppStdout "%APP_DIR%\logs\xi-web-out.log"
"%NSSM_EXE%" set "%APP_NAME%" AppStderr "%APP_DIR%\logs\xi-web-error.log"
"%NSSM_EXE%" set "%APP_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%APP_NAME%" AppExit Default Restart
"%NSSM_EXE%" set "%APP_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" start "%APP_NAME%"
if errorlevel 1 goto :service_error

timeout /t 2 /nobreak >nul
"%NSSM_EXE%" status "%APP_NAME%"
pause
exit /b 0

:install_error
popd
echo ERROR: Dependency installation or build failed. No service was created.
pause
exit /b 1

:service_error
echo ERROR: Service creation or startup failed.
echo Check %APP_DIR%\logs\xi-web-error.log
pause
exit /b 1
