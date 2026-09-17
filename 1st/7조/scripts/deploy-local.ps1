$ErrorActionPreference = "Stop"

$script_dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repo_dir = Split-Path -Parent $script_dir
$compose_file = Join-Path $repo_dir "compose.dev.yaml"
$deployment_source = Join-Path $repo_dir "contracts\deployments\31337.json"
$client_metadata_source = Join-Path $repo_dir "contracts\client\RevenueBridge.client.json"
$frontend_target = Join-Path $repo_dir "frontend\src\generated\contracts"
$backend_target = Join-Path $repo_dir "backend\src\main\resources\contracts\generated"
$temp_dir = Join-Path $env:TEMP "creator-revenue-bridge-contracts-$(New-Guid)"

New-Item -ItemType Directory -Force -Path $temp_dir | Out-Null

try {
    Set-Location $repo_dir

    docker compose -f $compose_file up -d anvil
    docker compose -f $compose_file run --rm forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://anvil:8545 --broadcast

    if (-not (Test-Path $deployment_source) -or (Get-Item $deployment_source).length -eq 0) {
        Write-Error "Deployment manifest was not generated: $deployment_source"
        exit 1
    }

    $enc = New-Object System.Text.UTF8Encoding $false
    $rb = docker compose -f $compose_file run --rm --no-deps forge inspect src/RevenueBridge.sol:RevenueBridge abi --json
    [System.IO.File]::WriteAllText((Join-Path $temp_dir "RevenueBridge.abi.json"), ($rb -join [Environment]::NewLine), $enc)

    $rr = docker compose -f $compose_file run --rm --no-deps forge inspect src/RevenueRightToken.sol:RevenueRightToken abi --json
    [System.IO.File]::WriteAllText((Join-Path $temp_dir "RevenueRightToken.abi.json"), ($rr -join [Environment]::NewLine), $enc)

    $ms = docker compose -f $compose_file run --rm --no-deps forge inspect src/mocks/MockSettlementToken.sol:MockSettlementToken abi --json
    [System.IO.File]::WriteAllText((Join-Path $temp_dir "MockSettlementToken.abi.json"), ($ms -join [Environment]::NewLine), $enc)

    New-Item -ItemType Directory -Force -Path $frontend_target | Out-Null
    New-Item -ItemType Directory -Force -Path $backend_target | Out-Null

    Copy-Item -Path $deployment_source -Destination (Join-Path $frontend_target "deployment.json") -Force
    Copy-Item -Path $deployment_source -Destination (Join-Path $backend_target "deployment.json") -Force
    Copy-Item -Path $client_metadata_source -Destination (Join-Path $frontend_target "RevenueBridge.client.json") -Force
    Copy-Item -Path $client_metadata_source -Destination (Join-Path $backend_target "RevenueBridge.client.json") -Force

    Get-ChildItem -Path $temp_dir -Filter "*.abi.json" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $frontend_target $_.Name) -Force
        Copy-Item -Path $_.FullName -Destination (Join-Path $backend_target $_.Name) -Force
    }

    Write-Host "Local contracts deployed and application artifacts synchronized."
    Write-Host "Canonical manifest: contracts/deployments/31337.json"
    Write-Host "Frontend artifacts: frontend/src/generated/contracts"
    Write-Host "Backend artifacts: backend/src/main/resources/contracts/generated"
} finally {
    Remove-Item -Recurse -Force -Path $temp_dir -ErrorAction SilentlyContinue
}
