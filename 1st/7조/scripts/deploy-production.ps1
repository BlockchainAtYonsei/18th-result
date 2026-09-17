[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^sha-[0-9a-f]{40}$')]
    [string]$Tag,

    [string]$EnvFile = 'C:/ProgramData/CreatorRevenueBridge/.env.production',

    [switch]$SkipPull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoDirectory = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    $localEnv = Join-Path $repoDirectory '.env.prod'
    if (Test-Path -LiteralPath $localEnv -PathType Leaf) {
        $EnvFile = $localEnv
        Write-Host "Using repository environment file: $EnvFile" -ForegroundColor Cyan
    } else {
        throw "Production environment file was not found: $EnvFile"
    }
}

$composeFile = Join-Path $repoDirectory 'compose.prod.yaml'
$composeArguments = @('compose', '--env-file', $EnvFile, '-f', $composeFile)
$originalImageTag = [Environment]::GetEnvironmentVariable('IMAGE_TAG', 'Process')

function Assert-NativeSuccess {
    param([string]$Action)

    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE."
    }
}

try {
    $env:IMAGE_TAG = $Tag

    $currentContainer = (& docker @composeArguments ps -q frontend 2>$null | Select-Object -First 1)
    $previousTag = $null

    if ($currentContainer) {
        $previousImage = [string](& docker inspect --format '{{.Config.Image}}' $currentContainer)
        Assert-NativeSuccess 'Inspecting the current frontend image'
        if ($previousImage.Trim() -match ':([^:@]+)$') {
            $previousTag = $Matches[1]
        }
    }

    & docker @composeArguments config --quiet
    Assert-NativeSuccess 'Validating the production Compose configuration'

    if (-not $SkipPull) {
        & docker @composeArguments pull
        Assert-NativeSuccess "Pulling production images for $Tag"
    }

    & docker @composeArguments up -d --remove-orphans --wait --wait-timeout 120
    $deploymentExitCode = $LASTEXITCODE

    if ($deploymentExitCode -eq 0) {
        Write-Host "Production deployment completed: $Tag"
        return
    }

    [Console]::Error.WriteLine("Deployment health check failed for $Tag.")

    if ($previousTag -and $previousTag -ne $Tag) {
        [Console]::Error.WriteLine("Rolling back to $previousTag.")
        $env:IMAGE_TAG = $previousTag

        if (-not $SkipPull) {
            & docker @composeArguments pull
            Assert-NativeSuccess "Pulling rollback images for $previousTag"
        }

        & docker @composeArguments up -d --remove-orphans --wait --wait-timeout 120
        Assert-NativeSuccess "Rolling back to $previousTag"
        [Console]::Error.WriteLine("Rollback completed: $previousTag")
    } else {
        [Console]::Error.WriteLine('No previous immutable image tag is available for rollback.')
    }

    throw "Production deployment failed: $Tag"
} finally {
    if ($null -eq $originalImageTag) {
        Remove-Item Env:IMAGE_TAG -ErrorAction SilentlyContinue
    } else {
        $env:IMAGE_TAG = $originalImageTag
    }
}
