@echo off
setlocal
cd /d "%~dp0"
title Baja datos - Control de gastos
set "NOPAUSE=%~1"
echo.
echo ========================================
echo  Control de gastos  -  baja datos
echo  Nube ^(ATP^)  -^>  Oracle local
echo ========================================
echo.
echo Esto REEMPLAZA / actualiza el sandbox local con datos de prod.
echo.

if not defined WALLET_PASSWORD set "WALLET_PASSWORD=WalletPass2798Aa"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-datos-desde-nube.ps1" -WalletPassword "%WALLET_PASSWORD%"
if errorlevel 1 goto :fail

echo.
echo OK - Datos de prod en local ^(control-gastos^).
goto :end

:fail
echo.
echo FALLO la baja de datos.
if /i not "%NOPAUSE%"=="/nopause" pause
exit /b 1

:end
if /i not "%NOPAUSE%"=="/nopause" (
  echo.
  pause
)
endlocal
exit /b 0
