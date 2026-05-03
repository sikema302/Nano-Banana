$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root '.runtime'
$serverPidFile = Join-Path $runtimeDir 'public-server.pid'
$tunnelPidFile = Join-Path $runtimeDir 'public-tunnel.pid'
$port = 3100

function Stop-ManagedProcess {
  param([string]$PidFile)

  if (-not (Test-Path $PidFile)) {
    return
  }

  $pidValue = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($pidValue -match '^\d+$') {
    $existing = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($existing) {
      Stop-Process -Id $existing.Id -Force
    }
  }

  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-PortOwner {
  param([int]$Port)

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($listenerPid in $listeners) {
    if ($listenerPid) {
      $existing = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
      if ($existing) {
        Stop-Process -Id $existing.Id -Force
      }
    }
  }
}

Stop-ManagedProcess -PidFile $tunnelPidFile
Stop-ManagedProcess -PidFile $serverPidFile
Stop-PortOwner -Port $port

Write-Host 'Public tunnel stopped.'
