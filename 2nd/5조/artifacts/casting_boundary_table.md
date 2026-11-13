# Casting boundary results (Solidity 0.8.24)

Source pattern mirrored: `uint128(abs(balance))` as in Notional V1 `ExchangeRate.sol` (`uint128 absBalance = uint128(balance.abs());`).
V1 pragma is `^0.6.0`; this isolated test uses 0.8.24. Explicit narrowing casts still truncate in 0.8.x.

| input | unsafe result | safe result (range check / SafeCast) |
| --- | --- | --- |
| 0 | 0 | 0 |
| 1 | 1 | 1 |
| -1 | 1 | 1 |
| 2^128-2 | 340282366920938463463374607431768211454 | 340282366920938463463374607431768211454 |
| -(2^128-2) | 340282366920938463463374607431768211454 | 340282366920938463463374607431768211454 |
| 2^128-1 | 340282366920938463463374607431768211455 | 340282366920938463463374607431768211455 |
| -(2^128-1) | 340282366920938463463374607431768211455 | 340282366920938463463374607431768211455 |
| 2^128 | 0 | REVERT |
| -(2^128) | 0 | REVERT |
| 2^128+1 | 1 | REVERT |
| -(2^128+1) | 1 | REVERT |
| abs(-1)+abs(-(2^128-1)) = 2^128 | 0 | REVERT |

Log: `logs/artifact1_forge_test.txt` — 14 passed, 0 failed (forge 1.8.5, solc 0.8.24).
