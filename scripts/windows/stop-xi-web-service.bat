@echo off
setlocal EnableExtensions

rem Stop the xi-web NSSM service without removing it.
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

sc query "%APP_NAME%" | findstr /i /c:"STOPPED" >nul
if not errorlevel 1 (
  echo %APP_NAME% is already stopped.
  pause
  exit /b 0
)

"%NSSM_EXE%" stop "%APP_NAME%"
if errorlevel 1 (
  echo ERROR: Failed to stop %APP_NAME%.
  pause
  exit /b 1
)

"%NSSM_EXE%" status "%APP_NAME%"
pause
exit /b 0
