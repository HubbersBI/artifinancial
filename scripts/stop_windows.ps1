# Stop Artifinancial (Windows PowerShell 5.1). Safe to run repeatedly.
# Keeps the data volume.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ContainerName = "artifinancial"
$VolumeName = "artifinancial-data"

$existing = docker ps -aq -f "name=^$($ContainerName)$"
if ([string]::IsNullOrWhiteSpace($existing)) {
    Write-Host "No container named $ContainerName"
} else {
    docker rm -f $ContainerName | Out-Null
    Write-Host "Stopped and removed container $ContainerName"
}

Write-Host "Data volume $VolumeName kept. Delete it with: docker volume rm $VolumeName"
