import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployFullSuiteFixture } from '../fixtures/deploy-full-suite.fixture';

// BAY AML Demo
// A = aliceWallet   : 신원 등록 + claim 보유, 1000 토큰
// B = bobWallet     : 신원 등록 + claim 보유, 500 토큰 (동결 대상)
// C = charlieWallet : 미등록 지갑
// 운영자 = tokenAgent : 토큰 Agent 이자 ReasonedFreeze 운영자

const AMOUNT = 10;
const DAY = 24 * 60 * 60;
const DURATION = 7 * DAY;

const REASON = ethers.utils.id('SANCTIONS_EXPOSURE');
const EVIDENCE = ethers.utils.id('case-001: mock KYT report v1');
const EVIDENCE_V2 = ethers.utils.id('case-001: mock KYT report v2');
const FALSE_POSITIVE = ethers.utils.id('FALSE_POSITIVE');
const EXPIRED = ethers.utils.id('EXPIRED');

async function deployAmlDemoFixture() {
  const context = await loadFixture(deployFullSuiteFixture);
  const {
    suite: { token },
    accounts: { deployer, tokenAgent },
  } = context;

  const freezer = await ethers.deployContract('ReasonedFreeze', [token.address], deployer);
  // 래퍼가 토큰의 동결 함수를 호출할 수 있도록 Agent 로 등록한다.
  await token.connect(deployer).addAgent(freezer.address);
  await freezer.connect(deployer).setOperator(tokenAgent.address, true);

  return { ...context, freezer };
}

async function freezeBob(context: Awaited<ReturnType<typeof deployAmlDemoFixture>>) {
  const {
    freezer,
    accounts: { tokenAgent, bobWallet },
  } = context;
  return freezer.connect(tokenAgent).freeze(bobWallet.address, REASON, EVIDENCE, DURATION);
}

describe('BAY AML Demo - ReasonedFreeze', () => {
  describe('실험 1. 등록된 사용자만 수신할 수 있는가', () => {
    it('A -> B (등록된 수신자) 전송은 성공한다', async () => {
      const {
        suite: { token },
        accounts: { aliceWallet, bobWallet },
      } = await loadFixture(deployAmlDemoFixture);

      await expect(token.connect(aliceWallet).transfer(bobWallet.address, AMOUNT)).to.changeTokenBalances(
        token,
        [aliceWallet, bobWallet],
        [-AMOUNT, AMOUNT],
      );
    });

    it('A -> C (미등록 수신자) 전송은 "Transfer not possible" 로 실패하고 잔액이 유지된다', async () => {
      const {
        suite: { token },
        accounts: { aliceWallet, charlieWallet },
      } = await loadFixture(deployAmlDemoFixture);

      await expect(token.connect(aliceWallet).transfer(charlieWallet.address, AMOUNT)).to.be.revertedWith('Transfer not possible');

      expect(await token.balanceOf(aliceWallet.address)).to.equal(1000);
      expect(await token.balanceOf(charlieWallet.address)).to.equal(0);
    });
  });

  describe('실험 2. 근거와 함께 동결하면 차단되고, 해제하면 재개되는가', () => {
    it('동결 시 사유, 근거 해시, 운영자, 만료 시점이 기록된다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        freezer,
        suite: { token },
        accounts: { tokenAgent, bobWallet },
      } = context;

      const tx = await freezeBob(context);
      await expect(tx).to.emit(freezer, 'FreezeApplied');
      await expect(tx).to.emit(token, 'AddressFrozen').withArgs(bobWallet.address, true, freezer.address);

      expect(await token.isFrozen(bobWallet.address)).to.equal(true);
      expect(await freezer.activeCaseOf(bobWallet.address)).to.equal(1);

      const c = await freezer.getCase(1);
      expect(c.wallet).to.equal(bobWallet.address);
      expect(c.operator).to.equal(tokenAgent.address);
      expect(c.reasonCode).to.equal(REASON);
      expect(c.evidenceHash).to.equal(EVIDENCE);
      expect(c.expiresAt.sub(c.frozenAt)).to.equal(DURATION);
      expect(c.closedAt).to.equal(0);
    });

    it('동결된 B 는 수신(A -> B)도 송신(B -> A)도 "wallet is frozen" 으로 실패하고 잔액이 유지된다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        suite: { token },
        accounts: { aliceWallet, bobWallet },
      } = context;

      await freezeBob(context);

      await expect(token.connect(aliceWallet).transfer(bobWallet.address, AMOUNT)).to.be.revertedWith('wallet is frozen');
      await expect(token.connect(bobWallet).transfer(aliceWallet.address, AMOUNT)).to.be.revertedWith('wallet is frozen');

      // 동결은 잔액을 건드리지 않는다.
      expect(await token.balanceOf(aliceWallet.address)).to.equal(1000);
      expect(await token.balanceOf(bobWallet.address)).to.equal(500);
    });

    it('운영자가 해제 사유와 함께 해제하면 전송이 재개되고, 기록은 지워지지 않는다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        freezer,
        suite: { token },
        accounts: { tokenAgent, aliceWallet, bobWallet },
      } = context;

      await freezeBob(context);

      const tx = await freezer.connect(tokenAgent).release(bobWallet.address, FALSE_POSITIVE);
      await expect(tx).to.emit(freezer, 'FreezeReleased').withArgs(1, bobWallet.address, tokenAgent.address, FALSE_POSITIVE);

      expect(await token.isFrozen(bobWallet.address)).to.equal(false);
      expect(await freezer.activeCaseOf(bobWallet.address)).to.equal(0);

      await expect(token.connect(aliceWallet).transfer(bobWallet.address, AMOUNT)).to.changeTokenBalances(
        token,
        [aliceWallet, bobWallet],
        [-AMOUNT, AMOUNT],
      );
      await expect(token.connect(bobWallet).transfer(aliceWallet.address, AMOUNT)).to.changeTokenBalances(
        token,
        [aliceWallet, bobWallet],
        [AMOUNT, -AMOUNT],
      );

      // 과거 판단은 재평가할 수 있도록 남아 있다.
      const c = await freezer.getCase(1);
      expect(c.evidenceHash).to.equal(EVIDENCE);
      expect(c.resolutionCode).to.equal(FALSE_POSITIVE);
      expect(c.closedAt).to.not.equal(0);
    });
  });

  describe('실험 3. 근거 없는 동결과 무권한 조치는 거부되는가', () => {
    it('근거 해시가 없거나 기한이 0 이거나 최대 기간을 넘으면 동결할 수 없다', async () => {
      const {
        freezer,
        suite: { token },
        accounts: { tokenAgent, bobWallet },
      } = await loadFixture(deployAmlDemoFixture);

      await expect(freezer.connect(tokenAgent).freeze(bobWallet.address, REASON, ethers.constants.HashZero, DURATION)).to.be.revertedWithCustomError(
        freezer,
        'EvidenceRequired',
      );
      await expect(freezer.connect(tokenAgent).freeze(bobWallet.address, REASON, EVIDENCE, 0)).to.be.revertedWithCustomError(
        freezer,
        'InvalidDuration',
      );
      await expect(freezer.connect(tokenAgent).freeze(bobWallet.address, REASON, EVIDENCE, 31 * DAY)).to.be.revertedWithCustomError(
        freezer,
        'InvalidDuration',
      );

      expect(await token.isFrozen(bobWallet.address)).to.equal(false);
    });

    it('일반 사용자 A 는 B 를 동결할 수도, 해제할 수도 없고 동결 상태는 유지된다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        freezer,
        suite: { token },
        accounts: { aliceWallet, bobWallet },
      } = context;

      await expect(freezer.connect(aliceWallet).freeze(bobWallet.address, REASON, EVIDENCE, DURATION)).to.be.revertedWithCustomError(
        freezer,
        'NotOperator',
      );

      await freezeBob(context);

      // 래퍼를 통한 해제 시도
      await expect(freezer.connect(aliceWallet).release(bobWallet.address, FALSE_POSITIVE)).to.be.revertedWithCustomError(freezer, 'NotOperator');
      // 토큰에 직접 해제 시도
      await expect(token.connect(aliceWallet).setAddressFrozen(bobWallet.address, false)).to.be.revertedWith(
        'AgentRole: caller does not have the Agent role',
      );
      // 동결 당사자 B 도 만료 전에는 스스로 풀 수 없다.
      await expect(freezer.connect(bobWallet).releaseExpired(bobWallet.address)).to.be.revertedWithCustomError(freezer, 'NotExpired');

      expect(await token.isFrozen(bobWallet.address)).to.equal(true);
      expect(await freezer.activeCaseOf(bobWallet.address)).to.equal(1);
    });
  });

  describe('실험 4. 만료된 동결은 운영자 없이도 풀리는가', () => {
    it('만료 후에는 동결 당사자 B 가 직접 해제할 수 있고 전송이 재개된다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        freezer,
        suite: { token },
        accounts: { aliceWallet, bobWallet },
      } = context;

      await freezeBob(context);

      // 만료 직전: 아직 풀 수 없다.
      await time.increase(DURATION - 60);
      expect(await freezer.isExpired(bobWallet.address)).to.equal(false);
      await expect(freezer.connect(bobWallet).releaseExpired(bobWallet.address)).to.be.revertedWithCustomError(freezer, 'NotExpired');

      // 만료 이후: 누구나 풀 수 있다.
      await time.increase(120);
      expect(await freezer.isExpired(bobWallet.address)).to.equal(true);

      const tx = await freezer.connect(bobWallet).releaseExpired(bobWallet.address);
      await expect(tx).to.emit(freezer, 'FreezeReleased').withArgs(1, bobWallet.address, bobWallet.address, EXPIRED);

      expect(await token.isFrozen(bobWallet.address)).to.equal(false);
      await expect(token.connect(bobWallet).transfer(aliceWallet.address, AMOUNT)).to.changeTokenBalances(
        token,
        [aliceWallet, bobWallet],
        [AMOUNT, -AMOUNT],
      );
    });

    it('기한을 연장하려면 새 근거가 필요하고, 연장하면 기존 만료 시점에는 풀리지 않는다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        freezer,
        suite: { token },
        accounts: { tokenAgent, bobWallet },
      } = context;

      await freezeBob(context);
      await time.increase(DURATION - DAY);

      // 같은 근거로는 연장할 수 없다.
      await expect(freezer.connect(tokenAgent).extend(bobWallet.address, EVIDENCE, DURATION)).to.be.revertedWithCustomError(
        freezer,
        'EvidenceRequired',
      );

      await expect(freezer.connect(tokenAgent).extend(bobWallet.address, EVIDENCE_V2, DURATION)).to.emit(freezer, 'FreezeExtended');
      expect((await freezer.getCase(1)).evidenceHash).to.equal(EVIDENCE_V2);

      // 원래 만료 시점이 지나도 아직 동결 상태다.
      await time.increase(2 * DAY);
      await expect(freezer.connect(bobWallet).releaseExpired(bobWallet.address)).to.be.revertedWithCustomError(freezer, 'NotExpired');
      expect(await token.isFrozen(bobWallet.address)).to.equal(true);
    });
  });

  describe('한계. 이 래퍼가 막지 못하는 경로', () => {
    it('Agent 의 forcedTransfer 는 동결된 B 의 토큰도 옮긴다', async () => {
      const context = await loadFixture(deployAmlDemoFixture);
      const {
        suite: { token },
        accounts: { tokenAgent, aliceWallet, bobWallet },
      } = context;

      await freezeBob(context);

      await expect(token.connect(tokenAgent).forcedTransfer(bobWallet.address, aliceWallet.address, AMOUNT)).to.changeTokenBalances(
        token,
        [aliceWallet, bobWallet],
        [AMOUNT, -AMOUNT],
      );
      expect(await token.isFrozen(bobWallet.address)).to.equal(true);
    });

    it('래퍼를 거치지 않고 토큰에 직접 동결하면 근거 기록 없이도 집행된다', async () => {
      const {
        freezer,
        suite: { token },
        accounts: { tokenAgent, aliceWallet, bobWallet },
      } = await loadFixture(deployAmlDemoFixture);

      await token.connect(tokenAgent).setAddressFrozen(bobWallet.address, true);

      await expect(token.connect(aliceWallet).transfer(bobWallet.address, AMOUNT)).to.be.revertedWith('wallet is frozen');
      expect(await freezer.activeCaseOf(bobWallet.address)).to.equal(0);
      expect(await freezer.caseCount()).to.equal(0);
    });
  });
});
