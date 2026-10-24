@echo off
setlocal EnableExtensions

rem Start the xi-web NSSM service without rebuilding it.
rem Run this file from an elevated Command Prompt.
set "APP_NAME=xi-web"
set "NSSM_EXE=D:\new\nssm-2.24\win64\nssm.exe"

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

sc query "%APP_NAME%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: %APP_NAME% service does not exist.
  pause
  exit /b 1
)

"%NSSM_EXE%" start "%APP_NAME%"
if errorlevel 1 (
  echo ERROR: Failed to start %APP_NAME%.
  pause
  exit /b 1
)

timeout /t 2 /nobreak >nul
"%NSSM_EXE%" status "%APP_NAME%"
pause
exit /b 0
