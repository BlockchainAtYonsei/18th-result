#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.dev.yaml"
deployment_file="$repo_dir/contracts/deployments/31337.json"
rpc_url="http://127.0.0.1:8545"
gross_revenue_per_period=${LOCAL_DEMO_GROSS_REVENUE:-1000000000}

json_string() {
    sed -n "s/.*\"$1\": \"\([^\"]*\)\".*/\1/p" "$deployment_file" | head -n 1
}

json_number() {
    sed -n "s/.*\"$1\": \([0-9][0-9]*\).*/\1/p" "$deployment_file" | head -n 1
}

require_value() {
    if [ -z "$1" ]; then
        echo "Missing deployment value: $2" >&2
        exit 1
    fi
}

cast_anvil() {
    docker compose -f "$compose_file" exec -T anvil cast "$@"
}

call_uint() {
    cast_anvil call "$1" "$2" ${3:+"$3"} ${4:+"$4"} --rpc-url "$rpc_url" | awk 'NR == 1 { print $1 }'
}

send_transaction() {
    sender=$1
    contract=$2
    signature=$3
    shift 3
    cast_anvil send --rpc-url "$rpc_url" --unlocked --from "$sender" "$contract" "$signature" "$@" >/dev/null
}

advance_to() {
    timestamp=$1
    cast_anvil rpc --rpc-url "$rpc_url" evm_setNextBlockTimestamp "$timestamp" >/dev/null
    cast_anvil rpc --rpc-url "$rpc_url" evm_mine >/dev/null
}

assert_equal() {
    if [ "$1" != "$2" ]; then
        echo "Assertion failed for $3: expected $1, got $2" >&2
        exit 1
    fi
}

cd "$repo_dir"
"$script_dir/deploy-local.sh"

bridge=$(json_string revenueBridge)
right_token=$(json_string revenueRightToken)
settlement_token=$(json_string settlementToken)
admin=$(json_string admin)
settler=$(json_string settler)
creator=$(json_string creator)
investor=$(json_string investor)
offering_id=$(json_number offeringId)
units_for_sale=$(json_number unitsForSale)
target_raise=$(json_number targetRaise)
revenue_share_bps=$(json_number revenueShareBps)
revenue_start=$(json_number revenueStart)
revenue_end=$(json_number revenueEnd)

require_value "$bridge" revenueBridge
require_value "$right_token" revenueRightToken
require_value "$settlement_token" settlementToken
require_value "$admin" admin
require_value "$settler" settler
require_value "$creator" creator
require_value "$investor" investor
require_value "$offering_id" offeringId
require_value "$units_for_sale" unitsForSale
require_value "$target_raise" targetRaise
require_value "$revenue_share_bps" revenueShareBps
require_value "$revenue_start" revenueStart
require_value "$revenue_end" revenueEnd

investor_balance_before=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$investor")
settler_balance_before=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$settler")
creator_balance_before=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$creator")

echo "[1/8] Investor approves $target_raise mUSD base units"
send_transaction "$investor" "$settlement_token" "approve(address,uint256)" "$bridge" "$target_raise"

echo "[2/8] Investor purchases $units_for_sale revenue-right units"
send_transaction "$investor" "$bridge" "invest(uint256,uint256)" "$offering_id" "$units_for_sale"

echo "[3/8] Funding is finalized"
send_transaction "$admin" "$bridge" "finalizeFunding(uint256)" "$offering_id"

echo "[4/8] Creator withdraws the advance"
send_transaction "$creator" "$bridge" "withdrawAdvance(uint256)" "$offering_id"

investor_share_per_period=$((gross_revenue_per_period * revenue_share_bps / 10000))
total_investor_revenue=$((investor_share_per_period * 3))

echo "[5/8] Settler approves $total_investor_revenue mUSD base units"
send_transaction "$settler" "$settlement_token" "approve(address,uint256)" "$bridge" "$total_investor_revenue"

period_index=0
for period_end in \
    $((revenue_start + 30 * 24 * 60 * 60)) \
    $((revenue_start + 60 * 24 * 60 * 60)) \
    "$revenue_end"
do
    evidence_hash=$(cast_anvil keccak "local-demo-settlement-$period_index")
    advance_to "$period_end"
    echo "[6/8] Settler reports period $period_index revenue"
    send_transaction "$settler" "$bridge" "settlePeriod(uint256,uint256,uint256,bytes32)" \
        "$offering_id" "$period_index" "$gross_revenue_per_period" "$evidence_hash"
    period_index=$((period_index + 1))
done

echo "[7/8] Offering is closed"
send_transaction "$admin" "$bridge" "closeOffering(uint256)" "$offering_id"

echo "[8/8] Investor claims accumulated revenue after closing"
send_transaction "$investor" "$bridge" "claim(uint256)" "$offering_id"

status=$(call_uint "$bridge" "statusOf(uint256)(uint8)" "$offering_id")
right_balance=$(call_uint "$right_token" "balanceOf(address,uint256)(uint256)" "$investor" "$offering_id")
claimed=$(call_uint "$bridge" "claimed(uint256,address)(uint256)" "$offering_id" "$investor")
claimable=$(call_uint "$bridge" "claimable(uint256,address)(uint256)" "$offering_id" "$investor")
escrow_liability=$(call_uint "$bridge" "totalEscrowLiability()(uint256)")
revenue_liability=$(call_uint "$bridge" "totalRevenueLiability()(uint256)")
bridge_balance=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$bridge")
investor_balance_after=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$investor")
settler_balance_after=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$settler")
creator_balance_after=$(call_uint "$settlement_token" "balanceOf(address)(uint256)" "$creator")

assert_equal 5 "$status" offeringStatus
assert_equal "$units_for_sale" "$right_balance" investorRightBalance
assert_equal "$total_investor_revenue" "$claimed" claimedRevenue
assert_equal 0 "$claimable" claimableRevenue
assert_equal 0 "$escrow_liability" totalEscrowLiability
assert_equal 0 "$revenue_liability" totalRevenueLiability
assert_equal 0 "$bridge_balance" bridgeSettlementTokenBalance
assert_equal $((investor_balance_before - target_raise + total_investor_revenue)) "$investor_balance_after" investorBalance
assert_equal $((settler_balance_before - total_investor_revenue)) "$settler_balance_after" settlerBalance
assert_equal $((creator_balance_before + target_raise)) "$creator_balance_after" creatorBalance

echo "Local RPC happy path completed successfully."
echo "Offering $offering_id is Closed and all recorded liabilities are zero."
echo "Investor claimed $total_investor_revenue mUSD base units."
