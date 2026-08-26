# Start Artifinancial in Docker (Windows PowerShell 5.1). Safe to run repeatedly.
#   .\scripts\start_windows.ps1 [-Build] [-NoOpen]

[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$ImageName = "artifinancial"
$ContainerName = "artifinancial"
$VolumeName = "artifinancial-data"
$Port = 8000
$Url = "http://localhost:$Port"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path ".env")) {
    Write-Host "No .env found - creating one from .env.example"
    Copy-Item ".env.example" ".env"
    Write-Host "Add your GROQ_API_KEY to .env, or set LLM_MOCK=true to run without one."
}

$existingImage = docker images -q $ImageName
if ($Build -or [string]::IsNullOrWhiteSpace($existingImage)) {
    Write-Host "Building image $ImageName"
    docker build -t $ImageName .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "docker build failed"
        exit 1
    }
}

# Replace any container left over from a previous run. The volume is untouched.
$existing = docker ps -aq -f "name=^$($ContainerName)$"
if (-not [string]::IsNullOrWhiteSpace($existing)) {
    docker rm -f $ContainerName | Out-Null
}

docker run -d --name $ContainerName -p "$($Port):8000" -v "$($VolumeName):/app/db" --env-file .env $ImageName | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker run failed"
    exit 1
}

Write-Host -NoNewline "Waiting for the app to start"
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        # Not up yet.
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host ""

if (-not $healthy) {
    Write-Host "The app did not become healthy within 30 seconds. Container logs:"
    docker logs $ContainerName
    exit 1
}

Write-Host "Artifinancial is running at $Url"
Write-Host "Stop it with: .\scripts\stop_windows.ps1"

if (-not $NoOpen) {
    Start-Process $Url
}
