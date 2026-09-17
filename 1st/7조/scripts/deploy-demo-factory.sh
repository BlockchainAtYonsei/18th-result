#!/bin/sh

set -eu

if [ "$#" -ne 1 ] || { [ "$1" != "--check" ] && [ "$1" != "--broadcast" ]; }; then
    echo "Usage: $0 --check|--broadcast" >&2
    exit 1
fi

: "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL must be set}"
: "${BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY:?BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY must be set}"
: "${BASE_SEPOLIA_ADMIN_ADDRESS:?BASE_SEPOLIA_ADMIN_ADDRESS must be set}"
: "${BASE_SEPOLIA_ISSUER_ADDRESS:?BASE_SEPOLIA_ISSUER_ADDRESS must be set}"
: "${BASE_SEPOLIA_SETTLER_ADDRESS:?BASE_SEPOLIA_SETTLER_ADDRESS must be set}"
: "${BASE_SEPOLIA_TOKEN_BASE_URI:?BASE_SEPOLIA_TOKEN_BASE_URI must be set}"

mode=$1
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.dev.yaml"
deployment_file="$repo_dir/contracts/deployments/base-sepolia/84532.json"

if [ ! -s "$deployment_file" ]; then
    echo "Base Sepolia deployment manifest was not found: $deployment_file" >&2
    exit 1
fi

eval "$(python3 - "$deployment_file" <<'PY'
import json, shlex, sys
d=json.load(open(sys.argv[1], encoding='utf-8'))['contracts']
for env, key in (
    ('BASE_SEPOLIA_INITIAL_SETTLEMENT_TOKEN', 'settlementToken'),
    ('BASE_SEPOLIA_INITIAL_REVENUE_BRIDGE', 'revenueBridge'),
    ('BASE_SEPOLIA_INITIAL_REVENUE_RIGHT_TOKEN', 'revenueRightToken'),
):
    print(f'export {env}={shlex.quote(d[key])}')
PY
)"

export BASE_SEPOLIA_DEPLOYMENT_PATH=/workspace/contracts/deployments/base-sepolia/84532.json
if [ "$mode" = "--broadcast" ]; then
    export BASE_SEPOLIA_WRITE_MANIFEST=true
else
    export BASE_SEPOLIA_WRITE_MANIFEST=false
fi

cd "$repo_dir"
set -- run --rm --no-deps \
    -e BASE_SEPOLIA_RPC_URL \
    -e BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY \
    -e BASE_SEPOLIA_ADMIN_ADDRESS \
    -e BASE_SEPOLIA_ISSUER_ADDRESS \
    -e BASE_SEPOLIA_SETTLER_ADDRESS \
    -e BASE_SEPOLIA_DEMO_CREATOR_ADDRESS \
    -e BASE_SEPOLIA_DEMO_INVESTOR_ADDRESS \
    -e BASE_SEPOLIA_TOKEN_BASE_URI \
    -e BASE_SEPOLIA_INITIAL_SETTLEMENT_TOKEN \
    -e BASE_SEPOLIA_INITIAL_REVENUE_BRIDGE \
    -e BASE_SEPOLIA_INITIAL_REVENUE_RIGHT_TOKEN \
    -e BASE_SEPOLIA_DEPLOYMENT_PATH \
    -e BASE_SEPOLIA_WRITE_MANIFEST \
    forge script script/DeployDemoFactory.s.sol:DeployDemoFactory \
    --rpc-url "$BASE_SEPOLIA_RPC_URL"

if [ "$mode" = "--broadcast" ]; then
    set -- "$@" --broadcast
fi

docker compose -f "$compose_file" "$@"

if [ "$mode" = "--broadcast" ]; then
    "$script_dir/sync-contract-artifacts.sh" "$deployment_file"
    echo "Base Sepolia demo factory deployed and artifacts synchronized."
else
    echo "Base Sepolia demo factory simulation completed. No transaction was broadcast."
fi
