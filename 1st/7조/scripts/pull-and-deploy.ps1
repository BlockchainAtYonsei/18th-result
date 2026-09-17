[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Tag,

    [string]$EnvFile = 'C:/ProgramData/CreatorRevenueBridge/.env.production',

    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$repoDir = Split-Path -Parent $scriptDir

# If Tag is not provided, attempt to use git rev-parse HEAD
if ([string]::IsNullOrWhiteSpace($Tag)) {
    try {
        $headCommit = (& git -C $repoDir rev-parse HEAD 2>$null).Trim()
        if ($headCommit -match '^[0-9a-f]{40}$') {
            $Tag = "sha-$headCommit"
            Write-Host "Using current git commit as image tag: $Tag" -ForegroundColor Cyan
        }
    } catch {
        # git command failed or not in repo
    }
}

if ([string]::IsNullOrWhiteSpace($Tag) -or $Tag -notmatch '^sha-[0-9a-f]{40}$') {
    throw "A valid image tag in the format 'sha-<40 character commit>' is required. Example: -Tag sha-0123456789abcdef0123456789abcdef01234567"
}

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    $localEnv = Join-Path $repoDir '.env.prod'
    if (Test-Path -LiteralPath $localEnv -PathType Leaf) {
        $EnvFile = $localEnv
        Write-Host "Using repository environment file: $EnvFile" -ForegroundColor Cyan
    } else {
        Write-Warning "Production environment file not found at: $EnvFile"
        Write-Host "You can initialize it by running: .\scripts\setup-production-runner.ps1 -ConfigureEnvOnly" -ForegroundColor Yellow
        throw "Environment file missing: $EnvFile"
    }
}

$deployScript = Join-Path $scriptDir 'deploy-production.ps1'

Write-Host "Starting production deployment with tag: $Tag" -ForegroundColor Green
$deployArgs = @{
    Tag      = $Tag
    EnvFile  = $EnvFile
    SkipPull = $SkipPull
}

& $deployScript @deployArgs
