import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData, parseEther, type Address, type Hex } from "viem";

type ProposalView = {
  proposer: Address;
  target: Address;
  value: bigint;
  data: Hex;
  intentHash: Hex;
  approvalCount: bigint;
  status: number;
  createdAt: bigint;
};

describe("MoaAccount", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();

  async function deployFixture() {
    const wallets = await viem.getWalletClients();
    const ownerWallets = wallets.slice(0, 5);
    const owners = [
      ownerWallets[0].account.address,
      ownerWallets[1].account.address,
      ownerWallets[2].account.address,
      ownerWallets[3].account.address,
      ownerWallets[4].account.address,
    ] as const;

    const account = await viem.deployContract("MoaAccount", [owners]);

    return {
      account,
      owners,
      ownerWallets,
      outsider: wallets[5],
    };
  }

  async function createFundedProposal() {
    const fixture = await deployFixture();
    const target = await viem.deployContract("ExecutionTarget");
    const value = parseEther("1");
    const data = encodeFunctionData({
      abi: target.abi,
      functionName: "record",
      args: ["approved payment"],
    });

    const depositHash = await fixture.ownerWallets[0].sendTransaction({
      to: fixture.account.address,
      value: parseEther("2"),
    });
    await publicClient.waitForTransactionReceipt({ hash: depositHash });

    await fixture.account.write.createProposal([target.address, value, data]);

    return { ...fixture, target, value, data };
  }

  async function approveThree(
    account: Awaited<ReturnType<typeof deployFixture>>["account"],
    ownerWallets: Awaited<ReturnType<typeof deployFixture>>["ownerWallets"],
  ) {
    for (let i = 0; i < 3; i += 1) {
      await account.write.approveProposal([0n], {
        account: ownerWallets[i].account,
      });
    }
  }

  it("stores five unique owners and fixes the threshold at three", async function () {
    const { account, owners } = await deployFixture();

    const storedOwners = (await account.read.owners()) as readonly Address[];
    assert.deepEqual(
      storedOwners.map((owner) => owner.toLowerCase()),
      owners.map((owner) => owner.toLowerCase()),
    );
    assert.equal(await account.read.OWNER_COUNT(), 5n);
    assert.equal(await account.read.THRESHOLD(), 3n);
    assert.equal(await account.read.isOwner([owners[4]]), true);
  });

  it("rejects duplicate owners", async function () {
    const wallets = await viem.getWalletClients();
    const duplicateOwners = [
      wallets[0].account.address,
      wallets[1].account.address,
      wallets[2].account.address,
      wallets[3].account.address,
      wallets[3].account.address,
    ] as const;

    await assert.rejects(
      viem.deployContract("MoaAccount", [duplicateOwners]),
      /DuplicateOwner/,
    );
  });

  it("accepts native asset deposits", async function () {
    const { account, ownerWallets } = await deployFixture();
    const amount = parseEther("2");

    await viem.assertions.emitWithArgs(
      ownerWallets[0].sendTransaction({ to: account.address, value: amount }),
      account,
      "Deposited",
      [ownerWallets[0].account.address, amount, amount],
    );

    assert.equal(await publicClient.getBalance({ address: account.address }), amount);
  });

  it("allows only owners to create proposals", async function () {
    const { account, outsider } = await deployFixture();

    await viem.assertions.revertWithCustomErrorWithArgs(
      account.write.createProposal(
        [outsider.account.address, parseEther("1"), "0x"],
        { account: outsider.account },
      ),
      account,
      "NotOwner",
      [outsider.account.address],
    );
  });

  it("stores an immutable intent for a proposal", async function () {
    const { account, target, value, data, owners } = await createFundedProposal();
    const proposal = (await account.read.getProposal([0n])) as ProposalView;
    const expectedIntentHash = await account.read.computeIntentHash([
      0n,
      target.address,
      value,
      data,
    ]);

    assert.equal(proposal.proposer.toLowerCase(), owners[0].toLowerCase());
    assert.equal(proposal.target.toLowerCase(), target.address.toLowerCase());
    assert.equal(proposal.value, value);
    assert.equal(proposal.data, data);
    assert.equal(proposal.intentHash, expectedIntentHash);
    assert.equal(proposal.approvalCount, 0n);
    assert.equal(proposal.status, 0);
  });

  it("counts each owner approval once", async function () {
    const { account, ownerWallets } = await createFundedProposal();

    await account.write.approveProposal([0n]);

    assert.equal(await account.read.hasApproved([0n, ownerWallets[0].account.address]), true);
    const proposal = (await account.read.getProposal([0n])) as ProposalView;
    assert.equal(proposal.approvalCount, 1n);

    await viem.assertions.revertWithCustomErrorWithArgs(
      account.write.approveProposal([0n]),
      account,
      "AlreadyApproved",
      [0n, ownerWallets[0].account.address],
    );
  });

  it("rejects execution before three approvals", async function () {
    const { account, ownerWallets, target, value, data } = await createFundedProposal();

    await account.write.approveProposal([0n]);
    await account.write.approveProposal([0n], { account: ownerWallets[1].account });

    await viem.assertions.revertWithCustomErrorWithArgs(
      account.write.executeProposal([0n, target.address, value, data]),
      account,
      "InsufficientApprovals",
      [0n, 2n, 3n],
    );
  });

  it("executes an approved payload exactly once", async function () {
    const { account, ownerWallets, target, value, data } = await createFundedProposal();
    await approveThree(account, ownerWallets);

    await account.write.executeProposal([0n, target.address, value, data], {
      account: ownerWallets[3].account,
    });

    assert.equal(await target.read.receivedValue(), value);
    assert.equal(((await account.read.getProposal([0n])) as ProposalView).status, 1);

    await viem.assertions.revertWithCustomErrorWithArgs(
      account.write.executeProposal([0n, target.address, value, data]),
      account,
      "ProposalNotPending",
      [0n],
    );
  });

  it("blocks a payload changed after approval", async function () {
    const { account, ownerWallets, target, value } = await createFundedProposal();
    await approveThree(account, ownerWallets);

    const tamperedData = encodeFunctionData({
      abi: target.abi,
      functionName: "record",
      args: ["attacker changed this"],
    });

    await viem.assertions.revertWithCustomError(
      account.write.executeProposal([0n, target.address, value, tamperedData]),
      account,
      "IntentMismatch",
    );

    assert.equal(await target.read.receivedValue(), 0n);
    assert.equal(((await account.read.getProposal([0n])) as ProposalView).status, 0);
  });

  it("restores pending state when the external execution fails", async function () {
    const { account, ownerWallets, target, value } = await createFundedProposal();
    await approveThree(account, ownerWallets);

    const failingData = encodeFunctionData({
      abi: target.abi,
      functionName: "fail",
    });
    await account.write.cancelProposal([0n]);
    await account.write.createProposal([target.address, value, failingData]);

    for (let i = 0; i < 3; i += 1) {
      await account.write.approveProposal([1n], {
        account: ownerWallets[i].account,
      });
    }

    await viem.assertions.revertWithCustomError(
      account.write.executeProposal([1n, target.address, value, failingData]),
      account,
      "ExecutionFailed",
    );

    assert.equal(((await account.read.getProposal([1n])) as ProposalView).status, 0);
  });

  it("allows only the proposer to cancel a pending proposal", async function () {
    const { account, ownerWallets } = await createFundedProposal();

    await viem.assertions.revertWithCustomErrorWithArgs(
      account.write.cancelProposal([0n], { account: ownerWallets[1].account }),
      account,
      "NotProposer",
      [0n, ownerWallets[1].account.address],
    );

    await account.write.cancelProposal([0n]);
    assert.equal(((await account.read.getProposal([0n])) as ProposalView).status, 2);
  });
});
