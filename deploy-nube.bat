@echo off
setlocal
cd /d "%~dp0"
title Deploy nube - Control de gastos
set "NOPAUSE=%~1"
echo.
echo ========================================
echo  Control de gastos  -  deploy a la nube
echo  Solo CODIGO  (sin sync de datos)
echo ========================================
echo.

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if /i not "%BRANCH%"=="nube" (
  echo Estas en rama "%BRANCH%", se necesita "nube".
  choice /C SN /M "Hacer checkout a nube y continuar"
  if errorlevel 2 goto :end
  git checkout nube
  if errorlevel 1 (
    echo ERROR: no se pudo cambiar a nube.
    goto :fail
  )
)

echo Desplegando desde rama nube...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-nube.ps1"
if errorlevel 1 goto :fail

echo.
echo OK - Control de gastos en la nube.
goto :end

:fail
echo.
echo FALLO el deploy.
if /i not "%NOPAUSE%"=="/nopause" pause
exit /b 1

:end
if /i not "%NOPAUSE%"=="/nopause" (
  echo.
  pause
)
endlocal
exit /b 0
