@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
call "%~dp0iniciar-control-gastos.bat"
