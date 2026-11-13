# ABI 함수 분류표 (공개 소스·Sourcify 기준)

> ABI 존재 ≠ 사고 당시 실행 가능. Escrow는 pre-pause 구현체 ABI와 사고 후 pause 구현체를 구분했습니다.
> GitHub 분석 커밋: `4bf7a85e6cf81cde4283e0efab0b03f21249ba00`.
> CashMarket logic: `0x307885bb78D490cF9198D678F8B2D1058D741F93` (Sourcify exact_match).

## 요약

- 분류 대상 함수 총합: **180**
- 계약별 함수 수: {'Escrow': 48, 'Portfolios': 38, 'ERC1155Trade': 22, 'ERC1155Token': 18, 'Directory': 9, 'EscrowPauseImpl': 5, 'CashMarket': 40}
- primary 분류 집계: {'기타·관리자': 145, '신규 포지션·청구권 생성': 13, '정산·상환': 13, '수동 검토 필요': 1, '출금': 8}
- 라벨 출현 횟수(복수 분류 중복 가산): {'기타·관리자': 145, '신규 포지션·청구권 생성': 15, '수동 검토 필요': 19, '정산·상환': 15, '출금': 8}
- 복수 분류 함수: **4**
- 수동 검토 표시: **19**

## 함수 목록

| contract | signature | categories | access | evidence | multi | manual |
| --- | --- | --- | --- | --- | --- | --- |
| Escrow | `DIRECTORY()` | 기타·관리자 | view | Escrow view/getter: view Governed directory | no | no |
| Escrow | `G_LIQUIDATION_DISCOUNT()` | 기타·관리자 | view | Escrow view/getter: view discount | no | no |
| Escrow | `G_LIQUIDITY_HAIRCUT()` | 기타·관리자 | view | Escrow view/getter: view haircut | no | no |
| Escrow | `G_LIQUIDITY_TOKEN_REPO_INCENTIVE()` | 기타·관리자 | view | Escrow view/getter: view incentive | no | no |
| Escrow | `G_RESERVE_ACCOUNT()` | 기타·관리자 | view | Escrow view/getter: view reserve | no | no |
| Escrow | `G_SETTLEMENT_DISCOUNT()` | 기타·관리자 | view | Escrow view/getter: view discount | no | no |
| Escrow | `WETH()` | 기타·관리자 | view | Escrow view/getter: view WETH | no | no |
| Escrow | `addExchangeRate(uint16,uint16,address,uint128,uint128,bool)` | 기타·관리자 | onlyOwner | Escrow.sol admin list oracle | no | no |
| Escrow | `addressToCurrencyId(address)` | 기타·관리자 | view | Escrow view/getter: view mapping | no | no |
| Escrow | `cashBalances(uint16,address)` | 기타·관리자 | view | Escrow view/getter: view balances | no | no |
| Escrow | `convertBalancesToETH(int256[])` | 기타·관리자 | view | Escrow view/getter: view conversion via ExchangeRate | no | no |
| Escrow | `currencyIdToAddress(uint16)` | 기타·관리자 | view | Escrow view/getter: view mapping | no | no |
| Escrow | `currencyIdToDecimals(uint16)` | 기타·관리자 | view | Escrow view/getter: view decimals | no | no |
| Escrow | `deposit(address,uint128)` | 기타·관리자 | external user | Escrow.sol deposit: increases cashBalances; collateral top-up, not fCash mint | no | no |
| Escrow | `depositEth()` | 기타·관리자 | external user payable | Escrow.sol depositEth: wrap ETH into cashBalances[0] | no | no |
| Escrow | `depositIntoMarket(address,uint8,uint128,uint128)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | cashMarket only | Escrow.sol depositIntoMarket: moves cash into market for LP/trade | no | yes |
| Escrow | `depositsOnBehalf(address,tuple[])` | 기타·관리자 | ERC1155Trade only | Escrow.sol depositsOnBehalf used by batchOperation before trades | no | no |
| Escrow | `exchangeRateOracles(uint16,uint16)` | 기타·관리자 | view | Escrow view/getter: view oracle | no | no |
| Escrow | `getBalances(address)` | 기타·관리자 | view | Escrow view/getter: view balances | no | no |
| Escrow | `getExchangeRate(uint16,uint16)` | 기타·관리자 | view | Escrow view/getter: view rate | no | no |
| Escrow | `initialize(address,address)` | 기타·관리자 | initializer | Ownable/Governed initialize overload | no | no |
| Escrow | `initialize(address,address,address,address)` | 기타·관리자 | initializer | Escrow.sol initialize(directory,owner,registry,weth) | no | no |
| Escrow | `isOwner()` | 기타·관리자 | view | Escrow view/getter: view Ownable | no | no |
| Escrow | `isValidCurrency(uint16)` | 기타·관리자 | view | Escrow view/getter: view | no | no |
| Escrow | `liquidate(address,uint128,uint16,uint16)` | 정산·상환 | external user | Escrow.sol liquidate: recollateralize undercollateralized account | no | no |
| Escrow | `liquidateBatch(address[],uint16,uint16)` | 정산·상환 | external user | Escrow.sol liquidateBatch | no | no |
| Escrow | `liquidatefCash(address,uint16,uint16)` | 정산·상환 | external user | Escrow.sol liquidatefCash | no | no |
| Escrow | `listCurrency(address,tuple)` | 기타·관리자 | onlyOwner | Escrow.sol listCurrency | no | no |
| Escrow | `maxCurrencyId()` | 기타·관리자 | view | Escrow view/getter: view | no | no |
| Escrow | `owner()` | 기타·관리자 | view | Escrow view/getter: view Ownable | no | no |
| Escrow | `portfolioSettleCash(address,int256[])` | 정산·상환 | Portfolios only | Escrow.sol portfolioSettleCash: applies matured asset settlement to cashBalances | no | no |
| Escrow | `renounceOwnership()` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Escrow | `setContract(uint8,address)` | 기타·관리자 | onlyOwner/Governed | Governed.setContract | no | no |
| Escrow | `setDiscounts(uint128,uint128,uint128)` | 기타·관리자 | onlyOwner | Escrow.sol setDiscounts | no | no |
| Escrow | `setLiquidityHaircut(uint128)` | 기타·관리자 | onlyOwner | Escrow.sol setLiquidityHaircut | no | no |
| Escrow | `setReserveAccount(address)` | 기타·관리자 | onlyOwner | Escrow.sol setReserveAccount | no | no |
| Escrow | `settleCashBalance(uint16,uint16,address,uint128)` | 정산·상환 | external user | Escrow.sol settleCashBalance: settles negative cash vs collateral | no | no |
| Escrow | `settleCashBalanceBatch(uint16,uint16,address[],uint128[])` | 정산·상환 | external user | Escrow.sol batch settleCashBalance | no | no |
| Escrow | `settleReserve(address,uint16)` | 정산·상환 | external user | Escrow.sol settleReserve: settle via reserve account | no | no |
| Escrow | `settlefCash(address,uint16,uint16,uint128)` | 정산·상환 | external user | Escrow.sol settlefCash: settle using fCash collateral path | no | no |
| Escrow | `tokenOptions(address)` | 기타·관리자 | view | Escrow view/getter: view | no | no |
| Escrow | `tokensReceived(address,address,address,uint256,bytes,bytes)` | 기타·관리자 | 수동 검토 필요 | ERC777 hook | Escrow.sol tokensReceived deposit path for ERC777 | no | yes |
| Escrow | `transferOwnership(address)` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Escrow | `unlockCurrentCash(uint16,address,int256)` | 수동 검토 필요 | Portfolios only | Escrow.sol unlockCurrentCash: adjusts market cashBalances; used in trade/settlem… | no | yes |
| Escrow | `withdraw(address,uint128)` | 출금 | external user | Escrow.sol withdraw→_withdraw: reduces cashBalances, transfers ERC20 | no | no |
| Escrow | `withdrawEth(uint128)` | 출금 | external user | Escrow.sol withdrawEth→_withdrawEth: WETH.withdraw + ETH transfer | no | no |
| Escrow | `withdrawFromMarket(address,uint8,uint128,uint128)` | 출금 | 수동 검토 필요 | cashMarket only | Escrow.sol: market pulls cash from account; paired with market LP exit | no | yes |
| Escrow | `withdrawsOnBehalf(address,tuple[])` | 출금 | ERC1155Trade only | Escrow.sol withdrawsOnBehalf→_withdraw for batchOperationWithdraw | no | no |
| Portfolios | `DIRECTORY()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `G_FCASH_HAIRCUT()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `G_FCASH_MAX_HAIRCUT()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `G_LIQUIDITY_HAIRCUT()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `G_MAX_ASSETS()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `G_NUM_CURRENCIES()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `cashGroups(uint8)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `createCashGroup(uint32,uint32,uint32,uint16,address)` | 기타·관리자 | 신규 포지션·청구권 생성 | onlyOwner | Portfolios.sol createCashGroup: admin enables new markets/idiosyncratic groups | yes | no |
| Portfolios | `currentCashGroupId()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `freeCollateral(address)` | 기타·관리자 | view | Portfolios view: view/calc | no | no |
| Portfolios | `freeCollateralAggregateOnly(address)` | 기타·관리자 | view | Portfolios view: view/calc | no | no |
| Portfolios | `freeCollateralFactors(address,uint256,uint256)` | 기타·관리자 | view | Portfolios view: view/calc | no | no |
| Portfolios | `freeCollateralView(address)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `freeCollateralViewAggregateOnly(address)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `getAsset(address,uint256)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `getAssets(address)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `getCashGroup(uint8)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `getCashGroups(uint8[])` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `initialize(address,address)` | 기타·관리자 | initializer | Governed initialize | no | no |
| Portfolios | `initialize(address,address,uint16,uint256)` | 기타·관리자 | initializer | Portfolios initialize | no | no |
| Portfolios | `isOwner()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `mintfCashPair(address,address,uint8,uint32,uint128)` | 신규 포지션·청구권 생성 | ERC1155Trade only | Portfolios.sol mintfCashPair: creates paired fCash debt/credit (claim mint) | no | no |
| Portfolios | `owner()` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `raiseCurrentCashViaCashReceiver(address,address,uint16,uint128)` | 정산·상환 | 수동 검토 필요 | Escrow liquidation/settle path | Portfolios.sol: sell fCash to raise cash | no | yes |
| Portfolios | `raiseCurrentCashViaLiquidityToken(address,uint16,uint128)` | 정산·상환 | 수동 검토 필요 | Escrow liquidation path | Portfolios.sol: pull LP tokens to raise cash | no | yes |
| Portfolios | `renounceOwnership()` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Portfolios | `searchAccountAsset(address,bytes1,uint8,uint16,uint32)` | 기타·관리자 | view | Portfolios view: view | no | no |
| Portfolios | `setContract(uint8,address)` | 기타·관리자 | onlyOwner | Governed | no | no |
| Portfolios | `setHaircuts(uint128,uint128,uint128)` | 기타·관리자 | onlyOwner | Portfolios setHaircuts | no | no |
| Portfolios | `setMaxAssets(uint256)` | 기타·관리자 | onlyOwner | Portfolios setMaxAssets | no | no |
| Portfolios | `setNumCurrencies(uint16)` | 기타·관리자 | onlyOwner | Portfolios setNumCurrencies | no | no |
| Portfolios | `settleMaturedAssets(address)` | 정산·상환 | public | Portfolios.sol settleMaturedAssets→cash via Escrow.portfolioSettleCash | no | no |
| Portfolios | `settleMaturedAssetsBatch(address[])` | 정산·상환 | external | Portfolios.sol settleMaturedAssetsBatch | no | no |
| Portfolios | `transferAccountAsset(address,address,bytes1,uint8,uint16,uint32,uint128)` | 기타·관리자 | 수동 검토 필요 | ERC1155Token only | Portfolios.sol transferAccountAsset: moves existing asset between accounts (not … | no | yes |
| Portfolios | `transferOwnership(address)` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Portfolios | `updateCashGroup(uint8,uint32,uint32,uint32,uint16,address)` | 기타·관리자 | onlyOwner | Portfolios.sol updateCashGroup | no | no |
| Portfolios | `upsertAccountAsset(address,tuple,bool)` | 신규 포지션·청구권 생성 | cashMarket only | Portfolios.sol upsertAccountAsset: insert/merge portfolio asset from market | no | no |
| Portfolios | `upsertAccountAssetBatch(address,tuple[],bool)` | 신규 포지션·청구권 생성 | cashMarket only | Portfolios.sol upsertAccountAssetBatch | no | no |
| ERC1155Trade | `BRIDGE_PROXY()` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `DIRECTORY()` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `balanceOf(address,uint256)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `balanceOfBatch(address[],uint256[])` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `batchOperation(address,uint32,tuple[],tuple[])` | 신규 포지션·청구권 생성 | 수동 검토 필요 | account or operator | ERC1155Trade.sol batchOperation: depositsOnBehalf + _batchTrade (may mint/trade … | no | yes |
| ERC1155Trade | `batchOperationWithdraw(address,uint32,tuple[],tuple[],tuple[])` | 출금 | 신규 포지션·청구권 생성 | account or operator | ERC1155Trade.sol batchOperationWithdraw: trades then withdrawsOnBehalf | yes | no |
| ERC1155Trade | `decodeAssetId(uint256)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `encodeAssetId(uint8,uint16,uint32,bytes1)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `encodeAssetId(tuple)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `initialize(address,address)` | 기타·관리자 | initializer | init | no | no |
| ERC1155Trade | `isApprovedForAll(address,address)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `isOwner()` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `operators(address,address)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `owner()` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `renounceOwnership()` | 기타·관리자 | onlyOwner | Ownable | no | no |
| ERC1155Trade | `safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)` | 기타·관리자 | 수동 검토 필요 | owner/operator | ERC1155 batch transfer | no | yes |
| ERC1155Trade | `safeTransferFrom(address,address,uint256,uint256,bytes)` | 기타·관리자 | 수동 검토 필요 | owner/operator | ERC1155 transfer of fCash/LP token ids | no | yes |
| ERC1155Trade | `setApprovalForAll(address,bool)` | 기타·관리자 | user | ERC1155 approval | no | no |
| ERC1155Trade | `setBridgeProxy(address)` | 기타·관리자 | onlyOwner | admin | no | no |
| ERC1155Trade | `setContract(uint8,address)` | 기타·관리자 | onlyOwner | Governed | no | no |
| ERC1155Trade | `supportsInterface(bytes4)` | 기타·관리자 | view | ERC1155Trade view/getter | no | no |
| ERC1155Trade | `transferOwnership(address)` | 기타·관리자 | onlyOwner | Ownable | no | no |
| ERC1155Token | `DIRECTORY()` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `balanceOf(address,uint256)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `balanceOfBatch(address[],uint256[])` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `decodeAssetId(uint256)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `encodeAssetId(uint8,uint16,uint32,bytes1)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `encodeAssetId(tuple)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `initialize(address,address)` | 기타·관리자 | initializer | init | no | no |
| ERC1155Token | `isApprovedForAll(address,address)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `isOwner()` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `operators(address,address)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `owner()` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `renounceOwnership()` | 기타·관리자 | onlyOwner | Ownable | no | no |
| ERC1155Token | `safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)` | 기타·관리자 | 수동 검토 필요 | owner/operator | ERC1155 batch | no | yes |
| ERC1155Token | `safeTransferFrom(address,address,uint256,uint256,bytes)` | 기타·관리자 | 수동 검토 필요 | owner/operator | ERC1155Token→Portfolios.transferAccountAsset | no | yes |
| ERC1155Token | `setApprovalForAll(address,bool)` | 기타·관리자 | user | approval | no | no |
| ERC1155Token | `setContract(uint8,address)` | 기타·관리자 | onlyOwner | Governed | no | no |
| ERC1155Token | `supportsInterface(bytes4)` | 기타·관리자 | view | ERC1155Token view | no | no |
| ERC1155Token | `transferOwnership(address)` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Directory | `contracts(uint256)` | 기타·관리자 | view | Directory view | no | no |
| Directory | `getContracts(uint8[])` | 기타·관리자 | view | Directory view | no | no |
| Directory | `initialize(address)` | 기타·관리자 | initializer | Directory initialize | no | no |
| Directory | `isOwner()` | 기타·관리자 | view | Directory view | no | no |
| Directory | `owner()` | 기타·관리자 | view | Directory view | no | no |
| Directory | `renounceOwnership()` | 기타·관리자 | onlyOwner | Ownable | no | no |
| Directory | `setContract(uint8,address)` | 기타·관리자 | onlyOwner | Directory setContract | no | no |
| Directory | `setDependencies(uint8,uint8[])` | 기타·관리자 | onlyOwner | Directory setDependencies | no | no |
| Directory | `transferOwnership(address)` | 기타·관리자 | onlyOwner | Ownable | no | no |
| EscrowPauseImpl | `owner()` | 기타·관리자 | view | Post-pause EmptyProxy-style impl (Sourcify 2026-09-04) | no | no |
| EscrowPauseImpl | `proxiableUUID()` | 기타·관리자 | view | UUPS uuid | no | no |
| EscrowPauseImpl | `transferTo(address,address,uint256)` | 출금 | 수동 검토 필요 | onlyOwner? | Post-pause rescue/transfer; not pre-incident Escrow withdraw API | no | yes |
| EscrowPauseImpl | `upgradeTo(address)` | 기타·관리자 | owner | UUPS upgrade | no | no |
| EscrowPauseImpl | `upgradeToAndCall(address,bytes)` | 기타·관리자 | owner | UUPS upgrade | no | no |
| CashMarket | `CASH_GROUP()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `DIRECTORY()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_LIQUIDITY_FEE()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_MATURITY_LENGTH()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_MAX_TRADE_SIZE()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_NUM_MATURITIES()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_RATE_ANCHOR()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_RATE_SCALAR()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `G_TRANSACTION_FEE()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `addLiquidity(uint32,uint128,uint128,uint32,uint32,uint32)` | 신규 포지션·청구권 생성 | user | CashMarket addLiquidity: mints LP/fCash market position | no | no |
| CashMarket | `addLiquidityOnBehalf(address,uint32,uint128,uint128,uint32,uint32)` | 신규 포지션·청구권 생성 | authorized | addLiquidity on behalf | no | no |
| CashMarket | `getActiveMaturities()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getCurrentCashTofCash(uint32,uint128)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getCurrentCashTofCashAtTime(uint32,uint128,uint32)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getMarket(uint32)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getMarketRates()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getRate(uint32)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getfCashToCurrentCash(uint32,uint128)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `getfCashToCurrentCashAtTime(uint32,uint128,uint32)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `initialize(address,address)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `initializeDependencies()` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `isOwner()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `markets(uint32)` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `owner()` | 기타·관리자 | view | CashMarket view/admin/init | no | no |
| CashMarket | `removeLiquidity(uint32,uint128,uint32)` | 출금 | 정산·상환 | user | removeLiquidity: burns LP, returns cash/fCash | yes | no |
| CashMarket | `removeLiquidityOnBehalf(address,uint32,uint128)` | 출금 | 정산·상환 | authorized | removeLiquidity on behalf | yes | no |
| CashMarket | `renounceOwnership()` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `setContract(uint8,address)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `setFee(uint32,uint128)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `setMaxTradeSize(uint128)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `setParameters(uint8,uint16,uint32,uint32,uint32,uint32)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `setRateFactors(uint32,uint16)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
| CashMarket | `settleLiquidityToken(address,uint128,uint32)` | 정산·상환 | settlement path | settle matured LP token | no | no |
| CashMarket | `takeCurrentCash(uint32,uint128,uint32,uint32)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | user | trade: take cash from market vs fCash | no | yes |
| CashMarket | `takeCurrentCashOnBehalf(address,uint32,uint128,uint32)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | authorized | takeCurrentCash on behalf | no | yes |
| CashMarket | `takefCash(uint32,uint128,uint32,uint128)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | user | trade: take fCash from market | no | yes |
| CashMarket | `takefCashOnBehalf(address,uint32,uint128,uint32)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | authorized | takefCash on behalf | no | yes |
| CashMarket | `tradeCashReceiver(address,uint128,uint128,uint32)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | Portfolios/internal path | tradeCashReceiver used in portfolio cash raise | no | yes |
| CashMarket | `tradeLiquidityToken(uint128,uint128,uint32)` | 신규 포지션·청구권 생성 | 수동 검토 필요 | Portfolios/internal path | tradeLiquidityToken | no | yes |
| CashMarket | `transferOwnership(address)` | 기타·관리자 | nonpayable | CashMarket view/admin/init | no | no |
