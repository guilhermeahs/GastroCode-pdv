@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if not exist "%ROOT%package.json" (
  set "ROOT=%~dp0..\\"
)

set "CLOUDFLARED=cloudflared"
where cloudflared >nul 2>&1
if errorlevel 1 (
  set "CLOUDFLARED=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
)

if /I not "%CLOUDFLARED%"=="cloudflared" (
  if not exist "%CLOUDFLARED%" (
    echo [ERRO] cloudflared nao encontrado.
    echo Instale com:
    echo winget install --id Cloudflare.cloudflared --exact
    echo.
    pause
    exit /b 1
  )
)

echo Abrindo API local em http://localhost:3210 ...
start "GastroCode - Sandbox API (3210)" cmd /k "cd /d ""%ROOT%"" && npm run api:teste"

timeout /t 2 /nobreak >nul

echo Abrindo tunnel cloudflared ...
start "GastroCode - Tunnel Cloudflare" cmd /k "cd /d ""%ROOT%"" && ""%CLOUDFLARED%"" tunnel --url http://localhost:3210 --no-autoupdate"

echo.
echo Pronto!
echo Copie a URL https://...trycloudflare.com da janela "GastroCode - Tunnel Cloudflare".
echo.
pause

