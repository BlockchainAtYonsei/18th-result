#!/usr/bin/env python3
"""Classify Notional V1 public/external ABI functions by state-change role.

Source basis: GitHub notional-finance/contracts@4bf7a85e6cf81cde4283e0efab0b03f21249ba00
plus Sourcify-verified ABIs for Escrow pre-pause impl and other contracts.
Does NOT claim callability at exploit time unless separately verified.
"""
from __future__ import annotations
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path("/workspace/notional-v1")
ABI_DIR = ROOT / "artifacts" / "abis"
OUT_CSV = ROOT / "artifacts" / "abi_classification.csv"
OUT_MD = ROOT / "artifacts" / "abi_classification.md"

# Categories (Korean labels as required)
CAT_WITHDRAW = "출금"
CAT_SETTLE = "정산·상환"
CAT_MINT = "신규 포지션·청구권 생성"
CAT_OTHER = "기타·관리자"
CAT_MANUAL = "수동 검토 필요"

# Manual classification keyed by (contract, signature)
# Based on source review of Escrow.sol / Portfolios.sol / ERC1155Trade.sol / ERC1155Token.sol / Directory.sol
CLASS: dict[tuple[str, str], dict] = {}

def add(contract, sig, cats, access, evidence, multi_note=""):
    CLASS[(contract, sig)] = {
        "categories": cats,
        "access": access,
        "evidence": evidence,
        "multi_note": multi_note,
        "manual": CAT_MANUAL in cats,
    }

# ---- Escrow (pre-pause impl ABI from Sourcify 0x8a134e65...) ----
C = "Escrow"
# withdraws
add(C, "withdraw(address,uint128)", [CAT_WITHDRAW], "external user",
    "Escrow.sol withdraw→_withdraw: reduces cashBalances, transfers ERC20")
add(C, "withdrawEth(uint128)", [CAT_WITHDRAW], "external user",
    "Escrow.sol withdrawEth→_withdrawEth: WETH.withdraw + ETH transfer")
add(C, "withdrawFromMarket(address,uint8,uint128,uint128)", [CAT_WITHDRAW, CAT_MANUAL],
    "cashMarket only", "Escrow.sol: market pulls cash from account; paired with market LP exit",
    "Market path can accompany position changes")
add(C, "withdrawsOnBehalf(address,tuple[])", [CAT_WITHDRAW], "ERC1155Trade only",
    "Escrow.sol withdrawsOnBehalf→_withdraw for batchOperationWithdraw")

# deposits / market — create or increase balances / fund markets
add(C, "deposit(address,uint128)", [CAT_OTHER], "external user",
    "Escrow.sol deposit: increases cashBalances; collateral top-up, not fCash mint")
add(C, "depositEth()", [CAT_OTHER], "external user payable",
    "Escrow.sol depositEth: wrap ETH into cashBalances[0]")
add(C, "depositsOnBehalf(address,tuple[])", [CAT_OTHER], "ERC1155Trade only",
    "Escrow.sol depositsOnBehalf used by batchOperation before trades")
add(C, "depositIntoMarket(address,uint8,uint128,uint128)", [CAT_MINT, CAT_MANUAL],
    "cashMarket only", "Escrow.sol depositIntoMarket: moves cash into market for LP/trade",
    "Supports new market positions; not direct user withdraw")

# settle / liquidate
add(C, "settleCashBalance(uint16,uint16,address,uint128)", [CAT_SETTLE], "external user",
    "Escrow.sol settleCashBalance: settles negative cash vs collateral")
add(C, "settleCashBalanceBatch(uint16,uint16,address[],uint128[])", [CAT_SETTLE], "external user",
    "Escrow.sol batch settleCashBalance")
add(C, "settlefCash(address,uint16,uint16,uint128)", [CAT_SETTLE], "external user",
    "Escrow.sol settlefCash: settle using fCash collateral path")
add(C, "settleReserve(address,uint16)", [CAT_SETTLE], "external user",
    "Escrow.sol settleReserve: settle via reserve account")
add(C, "portfolioSettleCash(address,int256[])", [CAT_SETTLE], "Portfolios only",
    "Escrow.sol portfolioSettleCash: applies matured asset settlement to cashBalances")
add(C, "liquidate(address,uint128,uint16,uint16)", [CAT_SETTLE], "external user",
    "Escrow.sol liquidate: recollateralize undercollateralized account")
add(C, "liquidateBatch(address[],uint16,uint16)", [CAT_SETTLE], "external user",
    "Escrow.sol liquidateBatch")
add(C, "liquidatefCash(address,uint16,uint16)", [CAT_SETTLE], "external user",
    "Escrow.sol liquidatefCash")

add(C, "unlockCurrentCash(uint16,address,int256)", [CAT_MANUAL], "Portfolios only",
    "Escrow.sol unlockCurrentCash: adjusts market cashBalances; used in trade/settlement plumbing")

# admin / views / init
for sig, note in [
    ("DIRECTORY()", "view Governed directory"),
    ("G_LIQUIDATION_DISCOUNT()", "view discount"),
    ("G_LIQUIDITY_HAIRCUT()", "view haircut"),
    ("G_LIQUIDITY_TOKEN_REPO_INCENTIVE()", "view incentive"),
    ("G_RESERVE_ACCOUNT()", "view reserve"),
    ("G_SETTLEMENT_DISCOUNT()", "view discount"),
    ("WETH()", "view WETH"),
    ("addressToCurrencyId(address)", "view mapping"),
    ("cashBalances(uint16,address)", "view balances"),
    ("convertBalancesToETH(int256[])", "view conversion via ExchangeRate"),
    ("currencyIdToAddress(uint16)", "view mapping"),
    ("currencyIdToDecimals(uint16)", "view decimals"),
    ("exchangeRateOracles(uint16,uint16)", "view oracle"),
    ("getBalances(address)", "view balances"),
    ("getExchangeRate(uint16,uint16)", "view rate"),
    ("isOwner()", "view Ownable"),
    ("isValidCurrency(uint16)", "view"),
    ("maxCurrencyId()", "view"),
    ("owner()", "view Ownable"),
    ("tokenOptions(address)", "view"),
]:
    add(C, sig, [CAT_OTHER], "view", f"Escrow view/getter: {note}")

add(C, "addExchangeRate(uint16,uint16,address,uint128,uint128,bool)", [CAT_OTHER], "onlyOwner",
    "Escrow.sol admin list oracle")
add(C, "listCurrency(address,tuple)", [CAT_OTHER], "onlyOwner", "Escrow.sol listCurrency")
add(C, "setDiscounts(uint128,uint128,uint128)", [CAT_OTHER], "onlyOwner", "Escrow.sol setDiscounts")
add(C, "setLiquidityHaircut(uint128)", [CAT_OTHER], "onlyOwner", "Escrow.sol setLiquidityHaircut")
add(C, "setReserveAccount(address)", [CAT_OTHER], "onlyOwner", "Escrow.sol setReserveAccount")
add(C, "setContract(uint8,address)", [CAT_OTHER], "onlyOwner/Governed", "Governed.setContract")
add(C, "initialize(address,address)", [CAT_OTHER], "initializer", "Ownable/Governed initialize overload")
add(C, "initialize(address,address,address,address)", [CAT_OTHER], "initializer",
    "Escrow.sol initialize(directory,owner,registry,weth)")
add(C, "renounceOwnership()", [CAT_OTHER], "onlyOwner", "Ownable")
add(C, "transferOwnership(address)", [CAT_OTHER], "onlyOwner", "Ownable")
add(C, "tokensReceived(address,address,address,uint256,bytes,bytes)", [CAT_OTHER, CAT_MANUAL],
    "ERC777 hook", "Escrow.sol tokensReceived deposit path for ERC777")

# ---- Portfolios ----
P = "Portfolios"
add(P, "mintfCashPair(address,address,uint8,uint32,uint128)", [CAT_MINT],
    "ERC1155Trade only",
    "Portfolios.sol mintfCashPair: creates paired fCash debt/credit (claim mint)")
add(P, "upsertAccountAsset(address,tuple,bool)", [CAT_MINT], "cashMarket only",
    "Portfolios.sol upsertAccountAsset: insert/merge portfolio asset from market")
add(P, "upsertAccountAssetBatch(address,tuple[],bool)", [CAT_MINT], "cashMarket only",
    "Portfolios.sol upsertAccountAssetBatch")
add(P, "createCashGroup(uint32,uint32,uint32,uint16,address)", [CAT_OTHER, CAT_MINT],
    "onlyOwner", "Portfolios.sol createCashGroup: admin enables new markets/idiosyncratic groups",
    "Admin config that enables later mint paths")
add(P, "updateCashGroup(uint8,uint32,uint32,uint32,uint16,address)", [CAT_OTHER], "onlyOwner",
    "Portfolios.sol updateCashGroup")
add(P, "transferAccountAsset(address,address,bytes1,uint8,uint16,uint32,uint128)",
    [CAT_OTHER, CAT_MANUAL], "ERC1155Token only",
    "Portfolios.sol transferAccountAsset: moves existing asset between accounts (not mint)",
    "Transfer of claims; may interact with withdraw UX via ERC1155")
add(P, "settleMaturedAssets(address)", [CAT_SETTLE], "public",
    "Portfolios.sol settleMaturedAssets→cash via Escrow.portfolioSettleCash")
add(P, "settleMaturedAssetsBatch(address[])", [CAT_SETTLE], "external",
    "Portfolios.sol settleMaturedAssetsBatch")
add(P, "raiseCurrentCashViaCashReceiver(address,address,uint16,uint128)", [CAT_SETTLE, CAT_MANUAL],
    "Escrow liquidation/settle path", "Portfolios.sol: sell fCash to raise cash")
add(P, "raiseCurrentCashViaLiquidityToken(address,uint16,uint128)", [CAT_SETTLE, CAT_MANUAL],
    "Escrow liquidation path", "Portfolios.sol: pull LP tokens to raise cash")

for sig, note in [
    ("DIRECTORY()", "view"),
    ("G_FCASH_HAIRCUT()", "view"),
    ("G_FCASH_MAX_HAIRCUT()", "view"),
    ("G_LIQUIDITY_HAIRCUT()", "view"),
    ("G_MAX_ASSETS()", "view"),
    ("G_NUM_CURRENCIES()", "view"),
    ("cashGroups(uint8)", "view"),
    ("currentCashGroupId()", "view"),
    ("freeCollateral(address)", "view/calc"),
    ("freeCollateralAggregateOnly(address)", "view/calc"),
    ("freeCollateralFactors(address,uint256,uint256)", "view/calc"),
    ("freeCollateralView(address)", "view"),
    ("freeCollateralViewAggregateOnly(address)", "view"),
    ("getAsset(address,uint256)", "view"),
    ("getAssets(address)", "view"),
    ("getCashGroup(uint8)", "view"),
    ("getCashGroups(uint8[])", "view"),
    ("isOwner()", "view"),
    ("owner()", "view"),
    ("searchAccountAsset(address,bytes1,uint8,uint16,uint32)", "view"),
]:
    add(P, sig, [CAT_OTHER], "view", f"Portfolios view: {note}")

add(P, "initialize(address,address)", [CAT_OTHER], "initializer", "Governed initialize")
add(P, "initialize(address,address,uint16,uint256)", [CAT_OTHER], "initializer", "Portfolios initialize")
add(P, "setContract(uint8,address)", [CAT_OTHER], "onlyOwner", "Governed")
add(P, "setHaircuts(uint128,uint128,uint128)", [CAT_OTHER], "onlyOwner", "Portfolios setHaircuts")
add(P, "setMaxAssets(uint256)", [CAT_OTHER], "onlyOwner", "Portfolios setMaxAssets")
add(P, "setNumCurrencies(uint16)", [CAT_OTHER], "onlyOwner", "Portfolios setNumCurrencies")
add(P, "renounceOwnership()", [CAT_OTHER], "onlyOwner", "Ownable")
add(P, "transferOwnership(address)", [CAT_OTHER], "onlyOwner", "Ownable")

# ---- ERC1155Trade ----
T = "ERC1155Trade"
add(T, "batchOperation(address,uint32,tuple[],tuple[])", [CAT_MINT, CAT_MANUAL],
    "account or operator",
    "ERC1155Trade.sol batchOperation: depositsOnBehalf + _batchTrade (may mint/trade fCash)",
    "Trade path can create positions; deposit-only increases collateral")
add(T, "batchOperationWithdraw(address,uint32,tuple[],tuple[],tuple[])",
    [CAT_WITHDRAW, CAT_MINT], "account or operator",
    "ERC1155Trade.sol batchOperationWithdraw: trades then withdrawsOnBehalf",
    "Same path combines withdraw and optional new positions/trades")
add(T, "safeTransferFrom(address,address,uint256,uint256,bytes)", [CAT_OTHER, CAT_MANUAL],
    "owner/operator", "ERC1155 transfer of fCash/LP token ids")
add(T, "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)", [CAT_OTHER, CAT_MANUAL],
    "owner/operator", "ERC1155 batch transfer")
add(T, "setApprovalForAll(address,bool)", [CAT_OTHER], "user", "ERC1155 approval")
add(T, "setBridgeProxy(address)", [CAT_OTHER], "onlyOwner", "admin")
add(T, "setContract(uint8,address)", [CAT_OTHER], "onlyOwner", "Governed")
add(T, "initialize(address,address)", [CAT_OTHER], "initializer", "init")
add(T, "renounceOwnership()", [CAT_OTHER], "onlyOwner", "Ownable")
add(T, "transferOwnership(address)", [CAT_OTHER], "onlyOwner", "Ownable")
for sig in [
    "BRIDGE_PROXY()", "DIRECTORY()", "balanceOf(address,uint256)", "balanceOfBatch(address[],uint256[])",
    "decodeAssetId(uint256)", "encodeAssetId(uint8,uint16,uint32,bytes1)", "encodeAssetId(tuple)",
    "isApprovedForAll(address,address)", "isOwner()", "operators(address,address)", "owner()",
    "supportsInterface(bytes4)",
]:
    add(T, sig, [CAT_OTHER], "view", "ERC1155Trade view/getter")

# ---- ERC1155Token ----
E = "ERC1155Token"
add(E, "safeTransferFrom(address,address,uint256,uint256,bytes)", [CAT_OTHER, CAT_MANUAL],
    "owner/operator", "ERC1155Token→Portfolios.transferAccountAsset")
add(E, "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)", [CAT_OTHER, CAT_MANUAL],
    "owner/operator", "ERC1155 batch")
add(E, "setApprovalForAll(address,bool)", [CAT_OTHER], "user", "approval")
add(E, "setContract(uint8,address)", [CAT_OTHER], "onlyOwner", "Governed")
add(E, "initialize(address,address)", [CAT_OTHER], "initializer", "init")
add(E, "renounceOwnership()", [CAT_OTHER], "onlyOwner", "Ownable")
add(E, "transferOwnership(address)", [CAT_OTHER], "onlyOwner", "Ownable")
for sig in [
    "DIRECTORY()", "balanceOf(address,uint256)", "balanceOfBatch(address[],uint256[])",
    "decodeAssetId(uint256)", "encodeAssetId(uint8,uint16,uint32,bytes1)", "encodeAssetId(tuple)",
    "isApprovedForAll(address,address)", "isOwner()", "operators(address,address)", "owner()",
    "supportsInterface(bytes4)",
]:
    add(E, sig, [CAT_OTHER], "view", "ERC1155Token view")

# ---- Directory ----
D = "Directory"
for sig in ["contracts(uint256)", "getContracts(uint8[])", "isOwner()", "owner()"]:
    add(D, sig, [CAT_OTHER], "view", "Directory view")
add(D, "initialize(address)", [CAT_OTHER], "initializer", "Directory initialize")
add(D, "setContract(uint8,address)", [CAT_OTHER], "onlyOwner", "Directory setContract")
add(D, "setDependencies(uint8,uint8[])", [CAT_OTHER], "onlyOwner", "Directory setDependencies")
add(D, "renounceOwnership()", [CAT_OTHER], "onlyOwner", "Ownable")
add(D, "transferOwnership(address)", [CAT_OTHER], "onlyOwner", "Ownable")

# ---- current Escrow pause impl (post-incident) — separate note ----
CUR = "EscrowPauseImpl"
add(CUR, "owner()", [CAT_OTHER], "view", "Post-pause EmptyProxy-style impl (Sourcify 2026-09-04)")
add(CUR, "proxiableUUID()", [CAT_OTHER], "view", "UUPS uuid")
add(CUR, "transferTo(address,address,uint256)", [CAT_WITHDRAW, CAT_MANUAL], "onlyOwner?",
    "Post-pause rescue/transfer; not pre-incident Escrow withdraw API")
add(CUR, "upgradeTo(address)", [CAT_OTHER], "owner", "UUPS upgrade")
add(CUR, "upgradeToAndCall(address,bytes)", [CAT_OTHER], "owner", "UUPS upgrade")


def abi_sig(entry: dict) -> str:
    name = entry["name"]
    types = []
    for inp in entry.get("inputs", []):
        t = inp["type"]
        if t.startswith("tuple"):
            # keep ABI JSON form as tuple / tuple[]
            types.append(t)
        else:
            types.append(t)
    return f"{name}({','.join(types)})"


def load_abi(name: str):
    return json.loads((ABI_DIR / f"{name}.json").read_text())


CONTRACT_FILES = [
    ("Escrow", "escrow", "0x9abd0b8868546105F6F48298eaDC1D9c82f7f683",
     "impl_pre_pause 0x8a134e651432A902041643668940C9a9cD270633 (Sourcify match); proxy InitializableAdminUpgradeabilityProxy",
     "pre-pause implementation ABI (not current pause impl)"),
    ("Portfolios", "portfolios", "0x0A4721117040ABF319b954aBF13F654505C34920",
     "current impl from EIP-1967 slot: 0xfce1c68e7414605ff1f97d197d6ba05a6d232311 (Sourcify match)",
     "공개 소스·Sourcify 기준; 사고 직전 구현체 동일 여부는 별도 미검증"),
    ("ERC1155Trade", "erc1155trade", "0xBbA899578bd3fA3DAa863A340f5600797993eF08",
     "impl 0x6f10251649c3d0b545506a5f374b63ccdf18ceaf (Sourcify exact_match)",
     "공개 소스·Sourcify 기준"),
    ("ERC1155Token", "erc1155", "0x3a31b8121D810B1D7b3004f94f205E6DFC1bf8d9",
     "impl 0xd1d5e903d0420d00b30c1a8a344000d8a4f6df8f (Sourcify exact_match)",
     "공개 소스·Sourcify 기준"),
    ("Directory", "directory", "0xdce848258dFB1bBf34C346Fbe40F10F8a42d2526",
     "impl 0x525a93c4682af10519be9bea242f2f75d44305e3 (Sourcify exact_match)",
     "공개 소스·Sourcify 기준"),
    ("EscrowPauseImpl", "impl_current", "0x7885484Eb568275C45FFF07415c5430Dac682848",
     "Post-exploit pause/UUPS impl (Sourcify exact_match verifiedAt 2026-09-04)",
     "사고 후 업그레이드 구현체 — pre-incident ABI와 구분"),
]

rows = []
missing = []
for contract, file, address, source, scope in CONTRACT_FILES:
    abi = load_abi(file)
    for entry in abi:
        if entry.get("type") != "function":
            continue
        sig = abi_sig(entry)
        meta = CLASS.get((contract, sig))
        if not meta:
            meta = {
                "categories": [CAT_MANUAL],
                "access": entry.get("stateMutability", ""),
                "evidence": "분류표에 사전 매핑 없음 — 수동 검토 필요",
                "multi_note": "",
                "manual": True,
            }
            missing.append((contract, sig))
        cats = meta["categories"]
        # primary category for counting: first non-manual, else manual
        primary = next((c for c in cats if c != CAT_MANUAL), CAT_MANUAL)
        multi = len([c for c in cats if c != CAT_MANUAL]) > 1
        rows.append({
            "contract": contract,
            "address": address,
            "version_scope": scope,
            "source": source,
            "signature": sig,
            "stateMutability": entry.get("stateMutability", ""),
            "categories": " | ".join(cats),
            "primary_category": primary,
            "multi_label": "yes" if multi else "no",
            "access_conditions": meta["access"],
            "evidence": meta["evidence"],
            "multi_note": meta["multi_note"],
            "manual_review": "yes" if meta["manual"] or CAT_MANUAL in cats else "no",
        })

# write CSV
fieldnames = list(rows[0].keys())
with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

# counts
by_primary = Counter(r["primary_category"] for r in rows)
by_contract = Counter(r["contract"] for r in rows)
multi_n = sum(1 for r in rows if r["multi_label"] == "yes")
manual_n = sum(1 for r in rows if r["manual_review"] == "yes")
# also count label occurrences (multi counted in each)
label_occ = Counter()
for r in rows:
    for c in r["categories"].split(" | "):
        if c != CAT_MANUAL:
            label_occ[c] += 1
        else:
            label_occ[CAT_MANUAL] += 1

md = []
md.append("# ABI 함수 분류표 (공개 소스·Sourcify 기준)\n\n")
md.append("> ABI 존재 ≠ 사고 당시 실행 가능. Escrow는 pre-pause 구현체 ABI와 사고 후 pause 구현체를 구분했습니다.\n")
md.append("> GitHub 분석 커밋: `4bf7a85e6cf81cde4283e0efab0b03f21249ba00` (master, 2021-02-15).\n")
md.append("> mainnet 주소: `artifacts/mainnet_addresses.json` (repo `mainnet.json`, gitHash `28619fb60b3d95230e89146fa7c9f5e092ed35ea`).\n\n")
md.append("## 요약\n\n")
md.append(f"- 분류 대상 함수 총합: **{len(rows)}**\n")
md.append(f"- 계약별 함수 수: {dict(by_contract)}\n")
md.append(f"- primary 분류 집계: {dict(by_primary)}\n")
md.append(f"- 라벨 출현 횟수(복수 분류 중복 가산): {dict(label_occ)}\n")
md.append(f"- 복수 분류 함수: **{multi_n}**\n")
md.append(f"- 수동 검토 표시: **{manual_n}**\n")
md.append(f"- 사전 매핑 누락(자동 수동표시): {len(missing)}\n\n")

md.append("## 계약·출처\n\n")
md.append("| contract | address | source notes | scope |\n| --- | --- | --- | --- |\n")
for contract, file, address, source, scope in CONTRACT_FILES:
    md.append(f"| {contract} | `{address}` | {source} | {scope} |\n")

md.append("\n## 함수 목록\n\n")
md.append("| contract | signature | categories | access | evidence | multi | manual |\n")
md.append("| --- | --- | --- | --- | --- | --- | --- |\n")
for r in rows:
    md.append(
        f"| {r['contract']} | `{r['signature']}` | {r['categories']} | {r['access_conditions']} | "
        f"{r['evidence'][:80]}{'…' if len(r['evidence'])>80 else ''} | {r['multi_label']} | {r['manual_review']} |\n"
    )

OUT_MD.write_text("".join(md), encoding="utf-8")
summary = {
    "total_functions": len(rows),
    "by_contract": dict(by_contract),
    "by_primary": dict(by_primary),
    "label_occurrences": dict(label_occ),
    "multi_label_count": multi_n,
    "manual_review_count": manual_n,
    "unmapped": missing,
}
(ROOT / "artifacts" / "abi_classification_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False, indent=2))
print("Wrote", OUT_CSV, OUT_MD)
