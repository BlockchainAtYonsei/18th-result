[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RegistrationToken,

    [string]$RunnerDir = 'C:\actions-runner',

    [string]$EnvDirectory = 'C:\ProgramData\CreatorRevenueBridge',

    [string]$RepoUrl = 'https://github.com/baypeline/creator-revenue-bridge',

    [string]$RunnerVersion = '2.322.0',

    [string]$Labels = 'production,windows,x64',

    [switch]$ConfigureEnvOnly,

    [switch]$SkipRunnerDownload,

    [switch]$InstallService
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

Write-Step "Checking system prerequisites"

# Check WSL
try {
    $wslStatus = & wsl.exe --status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "wsl.exe returned non-zero. Please ensure WSL 2 is installed."
    } else {
        Write-Host "WSL 2 is available." -ForegroundColor Green
    }
} catch {
    Write-Warning "Failed to query WSL status: $_"
}

# Check Docker
try {
    $dockerVersion = & docker version --format '{{.Server.Version}}' 2>$null
    if (-not $dockerVersion) {
        throw "Docker engine is not running or accessible from this PowerShell session."
    }
    $osType = & docker info --format '{{.OSType}}' 2>$null
    if ($osType -ne 'linux') {
        throw "Docker is running in $osType mode. Docker Desktop must be configured to Linux container mode with WSL 2 backend."
    }
    Write-Host "Docker is running in Linux container mode (v$dockerVersion)." -ForegroundColor Green
} catch {
    throw "Docker prerequisite check failed: $_"
}

Write-Step "Setting up production environment directory"

if (-not (Test-Path -LiteralPath $EnvDirectory)) {
    New-Item -ItemType Directory -Force -Path $EnvDirectory | Out-Null
    Write-Host "Created directory: $EnvDirectory" -ForegroundColor Green
} else {
    Write-Host "Directory already exists: $EnvDirectory"
}

$targetEnvFile = Join-Path $EnvDirectory '.env.production'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$sourceEnvExample = Join-Path $repoDirectory 'deploy\production.env.example'
$sourceLocalEnv = Join-Path $repoDirectory '.env.prod'

if (Test-Path -LiteralPath $sourceLocalEnv) {
    Copy-Item -LiteralPath $sourceLocalEnv -Destination $targetEnvFile -Force
    Write-Host "Synchronized $sourceLocalEnv -> $targetEnvFile" -ForegroundColor Green
} elseif (-not (Test-Path -LiteralPath $targetEnvFile)) {
    if (Test-Path -LiteralPath $sourceEnvExample) {
        Copy-Item -LiteralPath $sourceEnvExample -Destination $targetEnvFile -Force
        Write-Host "Copied $sourceEnvExample -> $targetEnvFile" -ForegroundColor Green
    } else {
        Write-Warning "Source template $sourceEnvExample not found. Please create $targetEnvFile manually."
    }
} else {
    Write-Host "Environment file already exists: $targetEnvFile"
}

# Restrict permissions with icacls (current user and SYSTEM only)
if (Test-Path -LiteralPath $targetEnvFile) {
    try {
        & icacls $targetEnvFile /inheritance:r | Out-Null
        & icacls $targetEnvFile /grant:r "${env:USERNAME}:(F)" 'SYSTEM:(F)' | Out-Null
        Write-Host "Applied restrictive ACL to $targetEnvFile" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to set ACL on ${targetEnvFile}: $_"
    }
}

if ($ConfigureEnvOnly) {
    Write-Host "`nEnvironment configuration completed (--ConfigureEnvOnly was specified)." -ForegroundColor Green
    Write-Host "Please review and edit '$targetEnvFile' before starting deployment."
    return
}

Write-Step "Setting up GitHub Actions Self-Hosted Runner"

if (-not (Test-Path -LiteralPath $RunnerDir)) {
    New-Item -ItemType Directory -Force -Path $RunnerDir | Out-Null
    Write-Host "Created runner directory: $RunnerDir" -ForegroundColor Green
}

$zipFileName = "actions-runner-win-x64-$RunnerVersion.zip"
$zipFilePath = Join-Path $RunnerDir $zipFileName
$runnerDownloadUrl = "https://github.com/actions/runner/releases/download/v$RunnerVersion/$zipFileName"

if (-not $SkipRunnerDownload -and -not (Test-Path -LiteralPath (Join-Path $RunnerDir 'config.cmd'))) {
    Write-Host "Downloading runner package from $runnerDownloadUrl..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $runnerDownloadUrl -OutFile $zipFilePath
    Write-Host "Extracting runner package..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipFilePath, $RunnerDir)
    Remove-Item -LiteralPath $zipFilePath -Force -ErrorAction SilentlyContinue
    Write-Host "Runner extracted to $RunnerDir" -ForegroundColor Green
} else {
    Write-Host "Runner files already present in $RunnerDir"
}

if ([string]::IsNullOrWhiteSpace($RegistrationToken)) {
    Write-Warning "`nRegistrationToken was not provided."
    Write-Host "To complete runner registration, please run:" -ForegroundColor Yellow
    Write-Host "  Set-Location '$RunnerDir'" -ForegroundColor Yellow
    Write-Host "  .\config.cmd --url '$RepoUrl' --token '<YOUR_TOKEN>' --labels '$Labels'" -ForegroundColor Yellow
    Write-Host "  .\svc.cmd install" -ForegroundColor Yellow
    Write-Host "  .\svc.cmd start" -ForegroundColor Yellow
    return
}

Write-Step "Configuring runner with repository"

Push-Location $RunnerDir
try {
    $configCmd = Join-Path $RunnerDir 'config.cmd'
    $configArgs = @(
        '--url', $RepoUrl,
        '--token', $RegistrationToken,
        '--labels', $Labels,
        '--unattended',
        '--replace'
    )
    
    Write-Host "Running: .\config.cmd $($configArgs -join ' ')"
    & $configCmd @configArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Runner configuration failed with exit code $LASTEXITCODE."
    }
    Write-Host "Runner registered successfully with labels: $Labels" -ForegroundColor Green

    if ($InstallService) {
        Write-Step "Installing and starting Windows Service"
        $svcCmd = Join-Path $RunnerDir 'svc.cmd'
        & $svcCmd install
        & $svcCmd start
        Write-Host "Runner service installed and started." -ForegroundColor Green
    } else {
        Write-Host "`nTo install the runner as a Windows Service, run:" -ForegroundColor Cyan
        Write-Host "  Set-Location '$RunnerDir'"
        Write-Host "  .\svc.cmd install"
        Write-Host "  .\svc.cmd start"
        Write-Host "Or to run interactively:" -ForegroundColor Cyan
        Write-Host "  .\run.cmd"
    }
} finally {
    Pop-Location
}

Write-Step "Setup complete"
Write-Host "Environment: $targetEnvFile"
Write-Host "Runner: $RunnerDir"
