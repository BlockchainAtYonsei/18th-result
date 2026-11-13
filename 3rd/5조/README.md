# 3주차 5조 — BAY AML Demo

ERC-3643 기반 근거가 남는 동결(ReasonedFreeze) 프로젝트입니다.

- [프로젝트 설명 및 실행 방법](./BAY_AML_DEMO.md)
- 원본: [lejuho/bay-aml-demo](https://github.com/lejuho/bay-aml-demo), `bay-aml-demo` 브랜치
- 가져온 커밋: `d57a882c85c7948bbf7904c49d1e203429dd253d`

이 저장소에서는 `3rd/5조`에서 `npm install` 후 `npx hardhat test test/aml/reasoned-freeze.test.ts`로 실행합니다.

---

# T-REX : Token for Regulated EXchanges

![GitHub](https://img.shields.io/github/license/ERC-3643/ERC-3643?color=green)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/ERC-3643/ERC-3643)
![GitHub Workflow Status (branch)](https://img.shields.io/github/actions/workflow/status/ERC-3643/ERC-3643/publish-release.yml)
![GitHub repo size](https://img.shields.io/github/repo-size/ERC-3643/ERC-3643)
![GitHub Release Date](https://img.shields.io/github/release-date/ERC-3643/ERC-3643)




----

<br><br>

<p align="center">
  <a href="https://tokeny.com/erc3643-whitepaper/">
  <img src="./docs/img/T-REX.png" width="150" title="t-rex">
  </a>
</p>


## Overview

The T-REX (Token for Regulated EXchanges) protocol is a comprehensive suite of Solidity smart contracts,
implementing the [ERC-3643 standard](https://eips.ethereum.org/EIPS/eip-3643) and designed to enable the issuance, management, and transfer of security
tokens in
compliance with regulations. It ensures secure and compliant transactions for all parties involved in the token exchange.

## Key Components

The T-REX protocol consists of several key components:

- **[ONCHAINID](https://github.com/onchain-id/solidity)**: A smart contract deployed by a user to interact with the security token or any other application
  where an on-chain identity may be relevant. It stores keys and claims related to a specific identity.

- **Trusted Issuers Registry**: This contract houses the addresses of all trusted claim issuers associated with a specific token.

- **Claim Topics Registry**: This contract maintains a list of all trusted claim topics related to the security token.

- **Identity Registry**: This contract holds the identity contract addresses of all eligible users authorized to hold the token. It is responsible for claim verification.

- **Compliance Smart Contract**: This contract independently operates to check whether a transfer is in compliance with the established rules for the token.

- **Security Token Contract**: This contract interacts with the Identity Registry to check the eligibility status of investors, enabling token holding and transactions.

## Getting Started

1. Clone the repository: `git clone https://github.com/ERC-3643/ERC-3643.git`
2. Install dependencies: `npm ci`
3. Compile the contracts: `hardhat compile`
4. Run tests: `hardhat test`

## Documentation

For a detailed understanding of the T-REX protocol, please refer to the [whitepaper](./docs/TREX-WhitePaper.pdf).
All functions of T-REX smart contracts are described in the [T-REX documentation](https://docs.tokeny.com/docs/smart-contracts)

## Contributing

We welcome contributions from the community. Please refer to the [CONTRIBUTING](./CONTRIBUTING.md) guide for more details.

## License

This project is licensed under the [GNU General Public License v3.0](./LICENSE.md).

----

<div style="padding: 16px;">
   <a href="https://tokeny.com/wp-content/uploads/2023/04/Tokeny_TREX-v4_SC_Audit_Report.pdf" target="_blank">
       <img src="https://hacken.io/wp-content/uploads/2023/02/ColorWBTypeSmartContractAuditBackFilled.png" alt="Proofed by Hacken - Smart contract audit" style="width: 258px; height: 100px;">
   </a>
</div>

----
