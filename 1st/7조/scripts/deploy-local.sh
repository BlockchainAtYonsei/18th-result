#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.dev.yaml"
deployment_source="$repo_dir/contracts/deployments/31337.json"

cd "$repo_dir"

docker compose -f "$compose_file" up -d anvil
docker compose -f "$compose_file" run --rm forge \
    script script/DeployLocal.s.sol:DeployLocal \
    --rpc-url http://anvil:8545 \
    --broadcast

"$script_dir/sync-contract-artifacts.sh" "$deployment_source"

echo "Local contracts deployed and application artifacts synchronized."
echo "Canonical manifest: contracts/deployments/31337.json"
