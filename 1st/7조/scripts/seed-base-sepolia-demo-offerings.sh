#!/bin/sh

set -eu

usage() {
    echo "Usage: $0 --check|--broadcast" >&2
    exit 1
}

if [ "$#" -ne 1 ]; then
    usage
fi

mode=$1
case "$mode" in
    --check|--broadcast) ;;
    *) usage ;;
esac

: "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL must be set}"
: "${BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY:?BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY must be set}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.dev.yaml"
deployment_file="$repo_dir/contracts/deployments/base-sepolia/84532.json"

if [ ! -s "$deployment_file" ]; then
    echo "Base Sepolia deployment manifest was not found: $deployment_file" >&2
    exit 1
fi

BASE_SEPOLIA_REVENUE_BRIDGE_ADDRESS=$(python3 - "$deployment_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as manifest_file:
    print(json.load(manifest_file)["contracts"]["revenueBridge"])
PY
)
export BASE_SEPOLIA_REVENUE_BRIDGE_ADDRESS

cd "$repo_dir"

set -- run --rm --no-deps \
    -e BASE_SEPOLIA_RPC_URL \
    -e BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY \
    -e BASE_SEPOLIA_REVENUE_BRIDGE_ADDRESS \
    -e BASE_SEPOLIA_DEMO_CREATOR_ADDRESS \
    -e DEMO_INSTANT_FUNDING_SECONDS \
    -e DEMO_INSTANT_START_DELAY_SECONDS \
    -e DEMO_INSTANT_PERIOD_SECONDS \
    forge script script/SeedBaseSepoliaDemoOfferings.s.sol:SeedBaseSepoliaDemoOfferings \
    --rpc-url "$BASE_SEPOLIA_RPC_URL"

if [ "$mode" = "--broadcast" ]; then
    set -- "$@" --broadcast
fi

docker compose -f "$compose_file" "$@"

if [ "$mode" = "--check" ]; then
    echo "Base Sepolia demo offering simulation completed. No transaction was broadcast."
else
    echo "Base Sepolia demo offerings were created."
fi
