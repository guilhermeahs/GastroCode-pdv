@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_URL=http://127.0.0.1:3001"
set "USER_APELIDO=gerente"
set "MOTIVO=Revogacao manual local"

if not "%~1"=="" set "USER_APELIDO=%~1"
if not "%~2"=="" set "MOTIVO=%~2"

echo.
echo === Revogar licenca local ===
echo API: %BASE_URL%
echo Usuario: %USER_APELIDO%
echo.

set /p USER_PIN=PIN do usuario %USER_APELIDO%: 
if "%USER_PIN%"=="" (
  echo PIN nao informado.
  exit /b 1
)

set "AUTH_TOKEN="
for /f "usebackq delims=" %%T in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $body=@{apelido='%USER_APELIDO%'; pin='%USER_PIN%'} | ConvertTo-Json -Compress; $resp=Invoke-RestMethod -Method Post -Uri '%BASE_URL%/api/auth/login' -ContentType 'application/json' -Body $body; [Console]::Write($resp.token)"`) do (
  set "AUTH_TOKEN=%%T"
)

if "!AUTH_TOKEN!"=="" (
  echo Falha no login. Confira apelido e PIN.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $headers=@{'x-auth-token'='!AUTH_TOKEN!'; 'x-role'='GERENTE'}; $body=@{motivo='%MOTIVO%'} | ConvertTo-Json -Compress; Invoke-RestMethod -Method Post -Uri '%BASE_URL%/api/licenca/bloquear' -Headers $headers -ContentType 'application/json' -Body $body | Out-Null; $status=Invoke-RestMethod -Method Get -Uri '%BASE_URL%/api/licenca/status'; Write-Host ('Status atual: ' + $status.status); Write-Host ('Mensagem: ' + $status.mensagem)"
if errorlevel 1 (
  echo Falha ao revogar a licenca.
  exit /b 1
)

rem encerra a sessao aberta pelo script (best effort)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $headers=@{'x-auth-token'='!AUTH_TOKEN!'; 'x-role'='GERENTE'}; Invoke-RestMethod -Method Post -Uri '%BASE_URL%/api/auth/logout' -Headers $headers -ContentType 'application/json' -Body '{}' | Out-Null } catch {}"

set "USER_PIN="
set "AUTH_TOKEN="

echo.
echo Licenca revogada com sucesso.
echo.
endlocal
exit /b 0
