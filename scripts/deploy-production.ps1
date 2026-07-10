param(
  [string]$Message = '',
  [string]$Branch = 'main',
  [string]$Repo = 'sikema302/Nano-Banana',
  [string]$HealthUrl = 'https://pixory.top/api/health',
  [int]$TimeoutMinutes = 25,
  [switch]$RunLocalChecks,
  [switch]$Force,
  [switch]$SkipWait,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$GitHubWebIps = @(
  '140.82.112.3',
  '140.82.113.3',
  '140.82.114.3',
  '140.82.112.4',
  '140.82.113.4',
  '140.82.114.4'
)

$GitHubApiIps = @(
  '140.82.112.6',
  '140.82.113.6',
  '140.82.114.6',
  '140.82.121.6',
  '20.205.243.168'
)

function Invoke-Checked {
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

function Invoke-GitHubApi {
  param([string]$Path)

  $url = "https://api.github.com/repos/$Repo/$Path"
  $lastError = $null
  foreach ($ip in $GitHubApiIps) {
    try {
      $args = @(
        '-sS',
        '--connect-timeout', '20',
        '--resolve', "api.github.com:443:$ip",
        '-H', 'Accept: application/vnd.github+json',
        $url
      )
      $text = & curl.exe @args
      if ($LASTEXITCODE -ne 0 -or -not $text) {
        $lastError = "curl exit code $LASTEXITCODE via $ip"
        continue
      }
      return $text | ConvertFrom-Json
    } catch {
      $lastError = $_.Exception.Message
    }
  }

  throw "GitHub API request failed: $Path. Last error: $lastError"
}

function Push-MainBranch {
  $lastError = $null
  foreach ($ip in $GitHubWebIps) {
    Write-Host "==> Push origin $Branch via github.com $ip"
    & git -c "http.curloptResolve=github.com:443:$ip" push origin $Branch
    if ($LASTEXITCODE -eq 0) {
      return
    }
    $lastError = "git push exit code $LASTEXITCODE via $ip"
  }

  throw "Unable to push to GitHub. Last error: $lastError"
}

function Wait-ForDeployRun {
  param([string]$HeadSha)

  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  $run = $null

  while ((Get-Date) -lt $deadline) {
    $runs = Invoke-GitHubApi "actions/runs?branch=$Branch&event=push&per_page=10"
    $run = @($runs.workflow_runs | Where-Object {
      $_.name -eq 'Deploy production' -and $_.head_sha -eq $HeadSha
    } | Select-Object -First 1)

    if ($run) {
      Write-Host "==> Deploy run: $($run.html_url)"
      break
    }

    Write-Host '==> Waiting for GitHub Actions run to appear...'
    Start-Sleep -Seconds 8
  }

  if (-not $run) {
    throw "Deploy workflow run did not appear for commit $HeadSha"
  }

  while ((Get-Date) -lt $deadline) {
    $run = Invoke-GitHubApi "actions/runs/$($run.id)"
    Write-Host "==> Deploy status: $($run.status) conclusion=$($run.conclusion)"

    if ($run.status -eq 'completed') {
      if ($run.conclusion -ne 'success') {
        throw "Deploy failed: $($run.html_url)"
      }
      return $run
    }

    Start-Sleep -Seconds 15
  }

  throw "Timed out waiting for deploy: $($run.html_url)"
}

function Test-ProductionHealth {
  Write-Host "==> Health check: $HealthUrl"
  $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $HealthUrl
  Write-Host $response.Content
}

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to read current git branch.'
}
if ($currentBranch -ne $Branch) {
  throw "Current branch is '$currentBranch'. Switch to '$Branch' before deploying."
}

if ($RunLocalChecks) {
  Invoke-Checked -FilePath 'npm.cmd' -Arguments @('run', 'lint') -Label 'Local type-check'
  Invoke-Checked -FilePath 'npm.cmd' -Arguments @('run', 'test:server') -Label 'Local server tests'
  Invoke-Checked -FilePath 'npm.cmd' -Arguments @('run', 'build') -Label 'Local frontend build'
}

$status = (& git status --porcelain)
if ($status) {
  if (-not $Message) {
    $Message = "deploy: production update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  }
  Invoke-Checked -FilePath 'git' -Arguments @('add', '-A') -Label 'Stage changes'
  Invoke-Checked -FilePath 'git' -Arguments @('commit', '-m', $Message) -Label "Commit: $Message"
} elseif ($Force) {
  if (-not $Message) {
    $Message = "deploy: production redeploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  }
  Invoke-Checked -FilePath 'git' -Arguments @('commit', '--allow-empty', '-m', $Message) -Label "Create empty deploy commit: $Message"
} else {
  Write-Host '==> No local changes to commit.'
}

$headSha = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $headSha) {
  throw 'Unable to read HEAD commit.'
}

Push-MainBranch

if (-not $SkipWait) {
  Wait-ForDeployRun -HeadSha $headSha | Out-Null
}

if (-not $SkipHealthCheck) {
  Test-ProductionHealth
}

Write-Host ''
Write-Host "Deploy complete: $headSha"
