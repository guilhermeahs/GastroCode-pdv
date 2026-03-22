Param()

$ErrorActionPreference = "Stop"

function Get-SecretEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($Name, "User")
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
  }
  return [string]$value
}

$owner = Get-SecretEnvValue -Name "GH_OWNER"
$repo = Get-SecretEnvValue -Name "GH_REPO"
$token = Get-SecretEnvValue -Name "GH_TOKEN"

if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repo) -or [string]::IsNullOrWhiteSpace($token)) {
  $missing = @()
  if ([string]::IsNullOrWhiteSpace($owner)) { $missing += "GH_OWNER" }
  if ([string]::IsNullOrWhiteSpace($repo)) { $missing += "GH_REPO" }
  if ([string]::IsNullOrWhiteSpace($token)) { $missing += "GH_TOKEN" }
  Write-Host "[publish-github] Variaveis ausentes: $($missing -join ', ')." -ForegroundColor Red
  Write-Host "Exemplo:" -ForegroundColor Yellow
  Write-Host '  setx GH_OWNER "guilhermeahs"'
  Write-Host '  setx GH_REPO "GastroCode-pdv"'
  Write-Host '  setx GH_TOKEN "SEU_TOKEN"'
  exit 1
}

$env:GH_OWNER = $owner
$env:GH_REPO = $repo
$env:GH_TOKEN = $token

Write-Host "[publish-github] Publicando $owner/$repo ..." -ForegroundColor Cyan
npm run build:desktop:publish
