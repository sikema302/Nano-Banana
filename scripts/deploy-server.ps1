param(
  [string]$ServerHost = '154.9.24.91',
  [int]$SshPort = 22,
  [string]$User = 'root',
  [string]$ProjectPath = '/var/www/nano-banana',
  [string]$AppName = 'nano-banana',
  [string]$BackupsDir = '',
  [string]$HealthUrl = 'http://154.9.24.91:3001/api/health',
  [string]$Password = '',
  [int]$KeepBackups = 5,
  [switch]$SkipLint,
  [switch]$SkipInstall,
  [switch]$SkipBackup,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root '.runtime'
$deployDir = Join-Path $runtimeDir 'deploy'
$stagingDir = Join-Path $deployDir 'package'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $deployDir "deploy-$timestamp.tar.gz"
$remoteArchivePath = "/tmp/$AppName-deploy-$timestamp.tar.gz"
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

function Copy-TrackedFile {
  param(
    [string]$SourceRoot,
    [string]$RelativePath,
    [string]$TargetRoot
  )

  $sourcePath = Join-Path $SourceRoot $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    return
  }

  $targetPath = Join-Path $TargetRoot $RelativePath
  $targetParent = Split-Path -Parent $targetPath
  if ($targetParent) {
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
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

function Invoke-ScpCopy {
  param(
    [string]$Source,
    [string]$Destination
  )

  Invoke-Logged -FilePath $script:scpPath -Arguments @(
    '-P', "$SshPort",
    '-o', 'StrictHostKeyChecking=no',
    $Source,
    $Destination
  ) -Label "Upload archive"
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

function New-RemoteBackupScript {
  param(
    [string]$RemoteProjectPath,
    [string]$RemoteBackupsDir,
    [string]$BackupTimestamp,
    [int]$BackupsToKeep,
    [bool]$ShouldSkipBackup
  )

  $skipBackupFlag = if ($ShouldSkipBackup) { '1' } else { '0' }

  return @"
mkdir -p '$RemoteBackupsDir'
if [ '$skipBackupFlag' = '0' ] && [ -n "`$(find '$RemoteProjectPath' -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .deploy-backups -print -quit 2>/dev/null)" ]; then
  backup_archive='$RemoteBackupsDir/$BackupTimestamp-pre-deploy.tar.gz'
  tar -czf "`$backup_archive" \
    --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./.runtime' \
    --exclude='./.deploy-backups' \
    -C '$RemoteProjectPath' .
  echo "Created backup: `$backup_archive"
fi
if [ '$BackupsToKeep' -gt 0 ]; then
  stale_backups=`$(ls -1dt '$RemoteBackupsDir'/*.tar.gz 2>/dev/null | tail -n +$($BackupsToKeep + 1))
  if [ -n "`$stale_backups" ]; then
    printf '%s\n' "`$stale_backups" | xargs -r rm -f
  fi
fi
"@
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
$scpPath = Ensure-Command -Name 'scp'
$tarPath = Ensure-Command -Name 'tar'
$gitPath = Ensure-Command -Name 'git'

New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

try {
  Set-AskPassPassword -PlainTextPassword $Password

  Push-Location $root
  try {
    if (-not $SkipLint) {
      Invoke-Logged -FilePath 'npm.cmd' -Arguments @('run', 'lint') -Label 'Local type-check'
    }

    Invoke-Logged -FilePath 'npm.cmd' -Arguments @('run', 'build') -Label 'Local frontend build'

    if (Test-Path -LiteralPath $stagingDir) {
      Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

    $trackedFiles = & $gitPath 'ls-files'
    if ($LASTEXITCODE -ne 0) {
      throw 'Unable to read tracked files with git ls-files.'
    }

    $untrackedFiles = & $gitPath 'ls-files' '--others' '--exclude-standard'
    if ($LASTEXITCODE -ne 0) {
      throw 'Unable to read untracked files with git ls-files.'
    }

    $filesToPackage = @($trackedFiles + $untrackedFiles | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
    foreach ($relativePath in $filesToPackage) {
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        continue
      }

      Copy-TrackedFile -SourceRoot $root -RelativePath $relativePath -TargetRoot $stagingDir
    }

    Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination (Join-Path $stagingDir 'dist') -Recurse -Force

    if (Test-Path -LiteralPath $archivePath) {
      Remove-Item -LiteralPath $archivePath -Force
    }

    Invoke-Logged -FilePath $tarPath -Arguments @(
      '-czf',
      $archivePath,
      '-C',
      $stagingDir,
      '.'
    ) -Label 'Create deploy archive'
  } finally {
    Pop-Location
  }

  Invoke-SshCommand -Command "mkdir -p '$ProjectPath'"
  Invoke-ScpCopy -Source $archivePath -Destination "${User}@${ServerHost}:$remoteArchivePath"

  $skipInstallFlag = if ($SkipInstall) { '1' } else { '0' }
  $backupScript = New-RemoteBackupScript -RemoteProjectPath $ProjectPath -RemoteBackupsDir $BackupsDir -BackupTimestamp $timestamp -BackupsToKeep $KeepBackups -ShouldSkipBackup $SkipBackup.IsPresent
  $remoteCommand = @"
set -e
$backupScript
cd '$ProjectPath'
rm -rf dist server src scripts supabase api
tar -xzf '$remoteArchivePath' -C '$ProjectPath'
rm -f '$remoteArchivePath'
if [ '$skipInstallFlag' = '0' ]; then
  npm ci
fi
if pm2 describe '$AppName' >/dev/null 2>&1; then
  pm2 restart '$AppName' --update-env
else
  pm2 start server/index.ts --name '$AppName' --interpreter ./node_modules/.bin/tsx
fi
pm2 save >/dev/null
"@

  Invoke-SshCommand -Command $remoteCommand

  if (-not $SkipHealthCheck) {
    Start-Sleep -Seconds 2
    Write-Host "==> Health check: $HealthUrl"
    $health = Wait-ForHealth -Url $HealthUrl
    Write-Host $health
  }

  Write-Host ''
  Write-Host 'Deploy finished.'
  if (-not $SkipBackup) {
    Write-Host "Backups kept in: $BackupsDir"
  }
} finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $askPassPath) {
    Remove-Item -LiteralPath $askPassPath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:SSH_ASKPASS -ErrorAction SilentlyContinue
  Remove-Item Env:SSH_ASKPASS_REQUIRE -ErrorAction SilentlyContinue
  Remove-Item Env:DISPLAY -ErrorAction SilentlyContinue
}
