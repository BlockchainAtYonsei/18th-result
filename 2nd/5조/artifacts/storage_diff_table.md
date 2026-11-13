# Storage layout diff (최소 예제 — NOT actual V1)
# Cite: OpenZeppelin upgradeable guidance — do not change order/type of existing vars; append only.
https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable#modifying-your-contracts

## Baseline vs Restricted (layout-preserving)
| variable | baseline slot/offset/type | restricted slot/offset/type | verdict |
| --- | --- | --- | --- |
| balances | 2/0/t_mapping(t_address,t_uint256) | 2/0/t_mapping(t_address,t_uint256) | MATCH |
| owner | 0/0/t_address | 0/0/t_address | MATCH |
| paused | 0/20/t_bool | 0/20/t_bool | MATCH |
| totalSupply | 3/0/t_uint256 | 3/0/t_uint256 | MATCH |
| unusedGap | 1/0/t_uint96 | 1/0/t_uint96 | MATCH |

Appended: halted, rescueReceiver

Summary: shared MATCH=5, MISMATCH=0

## Baseline vs Broken (reorder/type change)
| variable | baseline slot/offset/type | broken slot/offset/type | verdict |
| --- | --- | --- | --- |
| balances | 2/0/t_mapping(t_address,t_uint256) | 1/0/t_mapping(t_address,t_uint128) | MISMATCH |
| owner | 0/0/t_address | 0/1/t_address | MISMATCH |
| paused | 0/20/t_bool | 0/0/t_bool | MISMATCH |
| totalSupply | 3/0/t_uint256 | 2/0/t_uint256 | MISMATCH |

Removed: unusedGap
Added-only: halted

Summary: shared MATCH=0, MISMATCH=4
