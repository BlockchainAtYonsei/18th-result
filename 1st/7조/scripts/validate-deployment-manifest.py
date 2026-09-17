#!/usr/bin/env python3

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def fail(message: str) -> None:
    print(f"Invalid deployment manifest: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_address(container: dict[str, Any], key: str, section: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or ADDRESS_PATTERN.fullmatch(value) is None:
        fail(f"{section}.{key} must be an EVM address")
    if value.lower() == ZERO_ADDRESS:
        fail(f"{section}.{key} must not be the zero address")
    return value.lower()


def reject_secret_fields(value: Any, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = key.lower().replace("_", "").replace("-", "")
            if "privatekey" in normalized or normalized in {"mnemonic", "seedphrase"}:
                fail(f"secret-like field found at {path}.{key}")
            reject_secret_fields(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_secret_fields(child, f"{path}[{index}]")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a deployment manifest before image publication")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--chain-id", type=int, required=True)
    parser.add_argument("--network", required=True)
    parser.add_argument("--token-base-uri", required=True)
    args = parser.parse_args()

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(str(error))

    if not isinstance(manifest, dict):
        fail("root must be an object")

    reject_secret_fields(manifest)

    if manifest.get("chainId") != args.chain_id:
        fail(f"chainId must be {args.chain_id}")
    if manifest.get("network") != args.network:
        fail(f"network must be {args.network}")
    if manifest.get("tokenBaseUri") != args.token_base_uri:
        fail(f"tokenBaseUri must be {args.token_base_uri}")
    if not isinstance(manifest.get("usesMockSettlementToken"), bool):
        fail("usesMockSettlementToken must be a boolean")

    contracts = manifest.get("contracts")
    roles = manifest.get("roles")
    if not isinstance(contracts, dict):
        fail("contracts must be an object")
    if not isinstance(roles, dict):
        fail("roles must be an object")

    contract_addresses = {
        require_address(contracts, "settlementToken", "contracts"),
        require_address(contracts, "revenueBridge", "contracts"),
        require_address(contracts, "revenueRightToken", "contracts"),
        require_address(contracts, "revenueRightTokenFactory", "contracts"),
        require_address(contracts, "revenueBridgeDeployer", "contracts"),
        require_address(contracts, "demoFactory", "contracts"),
    }
    if len(contract_addresses) != 6:
        fail("contract addresses must be distinct")

    require_address(manifest, "deployer", "root")
    require_address(roles, "admin", "roles")
    require_address(roles, "issuer", "roles")
    require_address(roles, "settler", "roles")

    print(f"Deployment manifest is valid: {args.manifest}")


if __name__ == "__main__":
    main()
