@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "DOCKER_BIN=C:\Program Files\Docker\Docker\resources\bin"
if exist "%DOCKER_BIN%\docker.exe" set "PATH=%DOCKER_BIN%;%PATH%"

echo ========================================
echo  Control de gastos - modo desarrollo
echo  Oracle (Docker) + API local + Angular hot-reload
echo ========================================
echo.
echo  Este proyecto (puertos FIJOS — no usa otros):
echo    Front  http://127.0.0.1:4201/
echo    API    http://127.0.0.1:8081/
echo    Oracle host 1522
echo.
echo  Otros (si estan corriendo):
echo    Mesa Lista .... 4200 / 8080 / Oracle 1521
echo    Prod. limpieza . 4202 / 8083 / Oracle 1551
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo Falta Docker Desktop.
  pause
  exit /b 1
)

where mvn >nul 2>&1
if errorlevel 1 (
  echo Falta Maven ^(mvn^) en el PATH.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo Falta Node/npm en el PATH.
  pause
  exit /b 1
)

echo [1/4] Docker Desktop...
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=1;$i -le 40;$i++){ docker info 1>$null 2>$null; if($LASTEXITCODE -eq 0){ Write-Host '  OK'; exit 0 }; Start-Sleep 3 }; exit 1"
if errorlevel 1 (
  echo Docker Desktop no esta listo.
  pause
  exit /b 1
)

echo [2/4] Oracle en Docker ^(sin reconstruir el front^)...
docker compose up -d oracle
if errorlevel 1 (
  echo No se pudo levantar Oracle.
  pause
  exit /b 1
)

echo       Deteniendo API de Docker si estaba en 8081...
docker compose stop backend >nul 2>&1

echo [3/4] Esperando Oracle saludable...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$name='oracle-control-gastos'; for($i=1;$i -le 60;$i++){ $s=(docker inspect -f '{{.State.Health.Status}}' $name 2>$null); if($s -eq 'healthy'){ Write-Host '  Oracle OK'; exit 0 }; Write-Host ('  estado: ' + $s); Start-Sleep 5 }; exit 1"
if errorlevel 1 (
  echo Oracle no respondio a tiempo. Revisa: docker logs oracle-control-gastos
  pause
  exit /b 1
)

echo [4/4] Liberando puertos 8081 / 4201 si hay Java/Node local viejo...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; foreach($port in 8081,4201){ foreach($c in @(Get-NetTCPConnection -LocalPort $port -State Listen)){ $p=Get-Process -Id $c.OwningProcess -EA SilentlyContinue; if($p -and $p.ProcessName -match 'java|node'){ Write-Host ('  Cerrando ' + $p.ProcessName + ' PID ' + $p.Id); Stop-Process -Id $p.Id -Force } } }"

echo.
echo Arrancando API (Spring Boot :8081) en otra ventana...
start "control-gastos-api" cmd /k "cd /d ""%~dp0backend"" && mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081"

echo Arrancando Angular (ng serve :4201 estricto) en otra ventana...
start "control-gastos-front" cmd /k "cd /d ""%~dp0frontend"" && npm start"

echo Esperando front en 4201 y abriendo navegador...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:4201/'; for($i=1;$i -le 90;$i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ Start-Process $url; Write-Host '  Listo.'; exit 0 } } catch {}; Start-Sleep 2 }; Start-Process $url; Write-Host '  Se abrio el navegador (puede seguir compilando).'"

echo.
echo Edita frontend\src y guarda: el navegador se actualiza solo.
echo Cambios de Java: reinicia la ventana de la API ^(Ctrl+C y mvn spring-boot:run^).
echo Detener Oracle: docker compose stop oracle
echo.
pause
