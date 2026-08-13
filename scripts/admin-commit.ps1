param([string]$Message = '')
$ErrorActionPreference = 'Stop'
if (-not $Message) { $Message = "chore: admin commit $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
$status = (& git status --porcelain)
if (-not $status) { Write-Host '没有待提交的代码变更。'; exit 0 }
& git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }
& git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
Write-Host ("提交完成: " + ((& git rev-parse --short HEAD).Trim()))
