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
    --check) write_manifest=false ;;
    --broadcast) write_manifest=true ;;
    *) usage ;;
esac

: "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL must be set}"
: "${BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY:?BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY must be set}"
: "${BASE_SEPOLIA_ADMIN_ADDRESS:?BASE_SEPOLIA_ADMIN_ADDRESS must be set}"
: "${BASE_SEPOLIA_ISSUER_ADDRESS:?BASE_SEPOLIA_ISSUER_ADDRESS must be set}"
: "${BASE_SEPOLIA_SETTLER_ADDRESS:?BASE_SEPOLIA_SETTLER_ADDRESS must be set}"
: "${BASE_SEPOLIA_TOKEN_BASE_URI:?BASE_SEPOLIA_TOKEN_BASE_URI must be set}"

BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS=${BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS:-0x0000000000000000000000000000000000000000}
export BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.dev.yaml"
deployment_file="$repo_dir/contracts/deployments/base-sepolia/84532.json"

cd "$repo_dir"

export BASE_SEPOLIA_WRITE_MANIFEST=$write_manifest

set -- run --rm --no-deps \
    -e BASE_SEPOLIA_RPC_URL \
    -e BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY \
    -e BASE_SEPOLIA_ADMIN_ADDRESS \
    -e BASE_SEPOLIA_ISSUER_ADDRESS \
    -e BASE_SEPOLIA_SETTLER_ADDRESS \
    -e BASE_SEPOLIA_SETTLEMENT_TOKEN_ADDRESS \
    -e BASE_SEPOLIA_TOKEN_BASE_URI \
    -e BASE_SEPOLIA_WRITE_MANIFEST \
    forge script script/DeployBaseSepolia.s.sol:DeployBaseSepolia \
    --rpc-url "$BASE_SEPOLIA_RPC_URL"

if [ "$mode" = "--broadcast" ]; then
    set -- "$@" --broadcast
fi

docker compose -f "$compose_file" "$@"

if [ "$mode" = "--check" ]; then
    echo "Base Sepolia deployment simulation completed. No transaction was broadcast."
    exit 0
fi

if [ ! -s "$deployment_file" ]; then
    echo "Base Sepolia manifest was not generated: $deployment_file" >&2
    exit 1
fi

"$script_dir/sync-contract-artifacts.sh" "$deployment_file"

echo "Base Sepolia deployment and application artifact synchronization completed."
