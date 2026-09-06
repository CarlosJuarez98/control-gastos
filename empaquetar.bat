@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo  Control de gastos - Empaquetar JAR
echo ========================================
echo.
echo  Luego abre con: iniciar.bat
echo  App en http://localhost:8081  (Mesa Lista usa 8080)
echo.

if exist "C:\Program Files\nodejs" (
  set "PATH=C:\Program Files\nodejs;%PATH%"
)

where node >nul 2>&1
if errorlevel 1 (
  echo Falta Node.js. Instala Node LTS y vuelve a intentar.
  pause
  exit /b 1
)

where mvn >nul 2>&1
if errorlevel 1 (
  if exist "A:\Descargas\Desarrollo\apache-maven-3.9.9\bin\mvn.cmd" (
    set "PATH=A:\Descargas\Desarrollo\apache-maven-3.9.9\bin;%PATH%"
  ) else (
    echo Falta Maven en el PATH.
    pause
    exit /b 1
  )
)

if exist "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot" (
  set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
  set "PATH=%JAVA_HOME%\bin;%PATH%"
)

echo [1/2] Compilando frontend Angular...
cd frontend
call npm install
if errorlevel 1 goto :fail
call npx ng build --configuration=production
if errorlevel 1 goto :fail
cd ..

if not exist "frontend\dist\frontend\browser\index.html" (
  echo No se encontro frontend\dist\frontend\browser\index.html
  pause
  exit /b 1
)

echo.
echo [2/2] Empaquetando backend + frontend...
cd backend
call mvn -DskipTests package
if errorlevel 1 goto :fail
cd ..

echo.
echo Listo.
echo JAR: backend\target\control-gastos-1.0.0.jar
echo.
echo Para abrir la app:  iniciar.bat
echo URL: http://localhost:8081
echo.
pause
exit /b 0

:fail
echo.
echo Fallo el empaquetado. Revisa los mensajes de arriba.
pause
exit /b 1
