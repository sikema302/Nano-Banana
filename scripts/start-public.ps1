$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root '.runtime'
$serverLog = Join-Path $runtimeDir 'public-server.log'
$serverPidFile = Join-Path $runtimeDir 'public-server.pid'
$tunnelPidFile = Join-Path $runtimeDir 'public-tunnel.pid'
$tunnelOutLog = Join-Path $runtimeDir 'localhostrun.out.log'
$tunnelErrLog = Join-Path $runtimeDir 'localhostrun.err.log'
$port = 3100
$tsxPath = Join-Path $root 'node_modules\.bin\tsx.cmd'
$sshPath = (Get-Command ssh.exe -ErrorAction Stop).Source
$tunnelHost = 'localhost.run'

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

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Stop-ManagedProcess -PidFile $tunnelPidFile
Stop-ManagedProcess -PidFile $serverPidFile
Stop-PortOwner -Port $port

Write-Host 'Building frontend bundle...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  throw 'Frontend build failed.'
}

if (-not (Test-Path $tsxPath)) {
  throw "Missing tsx launcher at $tsxPath"
}

Set-Content -Path $serverLog -Value ''
Set-Content -Path $tunnelOutLog -Value ''
Set-Content -Path $tunnelErrLog -Value ''

$escapedRoot = $root.Replace("'", "''")
$escapedTsxPath = $tsxPath.Replace("'", "''")
$escapedServerLog = $serverLog.Replace("'", "''")
$serverCommand = "& { Set-Location '$escapedRoot'; `$env:HOST='0.0.0.0'; `$env:PORT='$port'; & '$escapedTsxPath' 'server/index.ts' *>> '$escapedServerLog' }"
$serverProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-Command', $serverCommand) -WindowStyle Hidden -PassThru
$serverProcess.Id | Set-Content $serverPidFile

$serverReady = $false
$serverDeadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $serverDeadline) {
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    $serverReady = $true
    break
  }

  Start-Sleep -Seconds 1
}

if (-not $serverReady) {
  throw "Public server did not start. Check $serverLog"
}

$serverOwnerPid = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess
if ($serverOwnerPid) {
  $serverOwnerPid | Set-Content $serverPidFile
}

$resolvedHosts = Resolve-DnsName $tunnelHost -Server 1.1.1.1 -ErrorAction Stop | Where-Object { $_.Type -eq 'A' }
$tunnelIp = $resolvedHosts | Select-Object -First 1 -ExpandProperty IPAddress
if (-not $tunnelIp) {
  throw "Unable to resolve $tunnelHost via 1.1.1.1"
}

$tunnelArgs = @(
  '-o',
  "HostName=$tunnelIp",
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'ServerAliveInterval=30',
  '-R',
  "80:127.0.0.1:$port",
  "nokey@$tunnelHost",
  '--',
  '--output',
  'json'
)
$tunnelProcess = Start-Process -FilePath $sshPath -ArgumentList $tunnelArgs -WindowStyle Hidden -RedirectStandardOutput $tunnelOutLog -RedirectStandardError $tunnelErrLog -PassThru
$tunnelProcess.Id | Set-Content $tunnelPidFile

$publicUrl = $null
$tunnelDeadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $tunnelDeadline -and -not $publicUrl) {
  $match = Select-String -Path $tunnelOutLog -Pattern 'https://[-0-9a-z]+\.lhr\.life' -AllMatches -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($match) {
    $publicUrl = $match.Matches[$match.Matches.Count - 1].Value
    break
  }

  Start-Sleep -Seconds 1
}

if (-not $publicUrl) {
  throw "Tunnel URL not found. Check $tunnelOutLog and $tunnelErrLog"
}

Write-Host ''
Write-Host "Local URL: http://127.0.0.1:$port"
Write-Host "Public URL: $publicUrl"
