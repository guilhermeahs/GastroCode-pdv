@echo off
setlocal

set "ROOT=%~dp0.."

start "API AppGestaoLoja" cmd /k "cd /d ""%ROOT%"" && node server.js"
start "Frontend AppGestaoLoja" cmd /k "cd /d ""%ROOT%\frontend"" && npm run dev"

echo API e Frontend iniciados em janelas separadas.
