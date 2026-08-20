param(
  [string]$ServerHost = '23.141.172.73',
  [int]$SshPort = 22,
  [string]$User = 'root',
  [string]$ProjectPath = '/var/www/nano-banana',
  [string]$AppName = 'nano-banana',
  [string]$BackupsDir = '',
  [string]$HealthUrl = 'https://pixory.top/api/ready',
  [string]$Password = '',
  [string]$BackupName = 'latest',
  [switch]$ListBackups,
  [switch]$SkipInstall,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root '.runtime'
$deployDir = Join-Path $runtimeDir 'deploy'
$askPassPath = Join-Path $deployDir 'ssh-askpass.bat'

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureString)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Ensure-Command {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Missing required command: $Name"
  }

  return $command.Source
}

function Invoke-Logged {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$Label
  )

  Write-Host "==> $Label"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Set-AskPassPassword {
  param([string]$PlainTextPassword)

  $escaped = $PlainTextPassword.Replace('^', '^^').Replace('&', '^&').Replace('|', '^|').Replace('<', '^<').Replace('>', '^>')
  Set-Content -LiteralPath $askPassPath -Value "@echo off`r`necho $escaped`r`n" -Encoding Ascii

  $env:SSH_ASKPASS = $askPassPath
  $env:SSH_ASKPASS_REQUIRE = 'force'
  $env:DISPLAY = '1'
}

function Invoke-SshCommand {
  param([string]$Command)

  Invoke-Logged -FilePath $script:sshPath -Arguments @(
    '-o', 'StrictHostKeyChecking=no',
    '-p', "$SshPort",
    "$User@$ServerHost",
    $Command
  ) -Label "SSH command"
}

function Wait-ForHealth {
  param(
    [string]$Url,
    [int]$MaxAttempts = 15,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
      return $response.Content
    } catch {
      if ($attempt -eq $MaxAttempts) {
        throw
      }

      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

if (-not $BackupsDir) {
  $BackupsDir = "$ProjectPath/.deploy-backups"
}

if (-not $Password) {
  $Password = $env:DEPLOY_SERVER_PASSWORD
}

if (-not $Password) {
  $securePassword = Read-Host 'Server password' -AsSecureString
  $Password = ConvertTo-PlainText -SecureString $securePassword
}

if (-not $Password) {
  throw 'Password is required.'
}

$sshPath = Ensure-Command -Name 'ssh'

New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

try {
  Set-AskPassPassword -PlainTextPassword $Password

  if ($ListBackups) {
    $listCommand = @"
if [ -d '$BackupsDir' ]; then
  ls -1dt '$BackupsDir'/*.tar.gz 2>/dev/null || true
fi
"@

    Invoke-SshCommand -Command $listCommand
    return
  }

  $skipInstallFlag = if ($SkipInstall) { '1' } else { '0' }
  $backupIsRelative = if ($BackupName.StartsWith('/')) { '0' } else { '1' }
  $restoreCommand = @"
set -e
selected_backup='$BackupName'
if [ "`$selected_backup" = 'latest' ]; then
  selected_backup=`$(ls -1dt '$BackupsDir'/*.tar.gz 2>/dev/null | head -n 1)
elif [ '$backupIsRelative' = '1' ]; then
  selected_backup='$BackupsDir/$BackupName'
fi
if [ -z "`$selected_backup" ] || [ ! -f "`$selected_backup" ]; then
  echo "Backup not found: $BackupName" >&2
  exit 1
fi
mkdir -p '$ProjectPath'
cd '$ProjectPath'
resolved_project=`$(pwd -P)
if [ "`$resolved_project" != '$ProjectPath' ]; then
  echo "Resolved project path mismatch: `$resolved_project" >&2
  exit 1
fi
find '$ProjectPath' -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .deploy-backups ! -name .git -exec rm -rf {} +
tar -xzf "`$selected_backup" -C '$ProjectPath'
if [ '$skipInstallFlag' = '0' ]; then
  npm ci
fi
if pm2 describe '$AppName' >/dev/null 2>&1; then
  pm2_instance_count=`$(pm2 jlist | node -e "let raw=''; process.stdin.on('data', chunk => raw += chunk); process.stdin.on('end', () => console.log(JSON.parse(raw).filter(item => item.name === '$AppName').length));")
  if [ "`$pm2_instance_count" -gt 1 ]; then
    pm2 scale '$AppName' 1
  fi
  pm2 reload '$AppName' --update-env --wait-ready --listen-timeout 60000
else
  pm2 start server/index.ts --name '$AppName' --interpreter ./node_modules/.bin/tsx --exec-mode cluster -i 1 --wait-ready --listen-timeout 60000
fi
pm2 save >/dev/null
echo "Restored backup: `$selected_backup"
"@

  Invoke-SshCommand -Command $restoreCommand

  if (-not $SkipHealthCheck) {
    Start-Sleep -Seconds 2
    Write-Host "==> Health check: $HealthUrl"
    $health = Wait-ForHealth -Url $HealthUrl
    Write-Host $health
  }

  Write-Host ''
  Write-Host 'Rollback finished.'
} finally {
  if (Test-Path -LiteralPath $askPassPath) {
    Remove-Item -LiteralPath $askPassPath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:SSH_ASKPASS -ErrorAction SilentlyContinue
  Remove-Item Env:SSH_ASKPASS_REQUIRE -ErrorAction SilentlyContinue
  Remove-Item Env:DISPLAY -ErrorAction SilentlyContinue
}
