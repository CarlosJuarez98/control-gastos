@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Puertos propios (NO usar los de Mesa Lista: 8080 / 1521 / 5500 / 4200)
set "PUERTO_APP=8081"
set "PUERTO_ORACLE=1522"
set "PUERTO_EM=5501"
set "JAR=%~dp0backend\target\control-gastos-1.0.0.jar"
set "URL=http://localhost:%PUERTO_APP%/"
set "DOCKER=C:\Program Files\Docker\Docker\resources\bin\docker.exe"

echo ========================================
echo  Control de gastos
echo ========================================
echo.
echo  App:     %URL%
echo  Oracle:  localhost:%PUERTO_ORACLE%
echo  (Mesa Lista sigue en 8080 / 1521 — no se toca)
echo.

if not exist "%JAR%" (
  echo No existe el JAR.
  echo Primero ejecuta: empaquetar.bat
  echo.
  pause
  exit /b 1
)

if exist "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\bin\java.exe" (
  set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
  set "PATH=%JAVA_HOME%\bin;%PATH%"
)

where java >nul 2>&1
if errorlevel 1 (
  echo Falta Java 17.
  pause
  exit /b 1
)

echo [1/4] Comprobando que el JAR traiga el frontend...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('%JAR:\=\\%'); $ok=($z.Entries | Where-Object { $_.FullName -replace '\\','/' -match 'BOOT-INF/classes/static/index.html$' } | Select-Object -First 1) -ne $null; $z.Dispose(); if ($ok) { Write-Host '  Frontend OK.'; exit 0 } else { Write-Host '  El JAR no incluye el frontend.'; exit 1 }"
if errorlevel 1 (
  echo Ejecuta primero: empaquetar.bat
  pause
  exit /b 1
)

echo.
echo [2/4] Liberando solo el puerto %PUERTO_APP% de esta app...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $pids=@(Get-NetTCPConnection -LocalPort %PUERTO_APP% -State Listen | Select-Object -ExpandProperty OwningProcess -Unique); if ($pids.Count -eq 0) { Write-Host '  Puerto %PUERTO_APP% libre.'; exit 0 }; foreach ($procId in $pids) { if ($procId -gt 0) { $p=Get-Process -Id $procId -ErrorAction SilentlyContinue; Write-Host ('  Cerrando PID ' + $procId + ' (' + $p.ProcessName + ')...'); Stop-Process -Id $procId -Force } }; Start-Sleep -Seconds 1; Write-Host '  Listo.'"

echo.
echo [3/4] Arrancando Oracle propio en puerto %PUERTO_ORACLE%...
if exist "%DOCKER%" (
  "%DOCKER%" compose -f "%~dp0docker-compose.yml" up -d oracle
) else (
  where docker >nul 2>&1
  if errorlevel 1 (
    echo Falta Docker Desktop.
    pause
    exit /b 1
  )
  docker compose -f "%~dp0docker-compose.yml" up -d oracle
)
if errorlevel 1 (
  echo No se pudo levantar Oracle.
  pause
  exit /b 1
)

echo Esperando a que Oracle quede healthy (la primera vez puede tardar)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$docker='C:\Program Files\Docker\Docker\resources\bin\docker.exe'; if (-not (Test-Path $docker)) { $docker='docker' }; for ($i=1; $i -le 60; $i++) { $s = & $docker inspect -f '{{.State.Health.Status}}' oracle-control-gastos 2>$null; if ($s -eq 'healthy') { Write-Host '  Oracle listo.'; exit 0 }; Write-Host ('  Esperando... ' + $i + ' (' + $s + ')'); Start-Sleep -Seconds 5 }; Write-Host '  AVISO: Oracle aun no reporta healthy; se intenta arrancar igual.'; exit 0"

echo.
echo [4/4] Iniciando Control de gastos...
echo Deja esta ventana abierta. Cierra con Ctrl+C para detener.
echo.

start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=1;$i -le 90;$i++){ try { $r=Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ Start-Process '%URL%'; exit 0 } } catch {} Start-Sleep -Seconds 2 }; Start-Process '%URL%'"

java -jar "%JAR%"

pause
