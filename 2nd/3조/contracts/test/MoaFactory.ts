import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import type { Address } from "viem";

describe("MoaFactory", async function () {
  const { viem } = await network.create();

  it("creates and indexes a three-of-five account", async function () {
    const wallets = await viem.getWalletClients();
    const owners = [
      wallets[0].account.address,
      wallets[1].account.address,
      wallets[2].account.address,
      wallets[3].account.address,
      wallets[4].account.address,
    ] as const;
    const factory = await viem.deployContract("MoaFactory");

    await factory.write.createAccount([owners]);

    const accountAddress = (await factory.read.accountAt([0n])) as Address;
    const account = await viem.getContractAt("MoaAccount", accountAddress);

    assert.equal(await factory.read.accountCount(), 1n);
    assert.equal(await factory.read.isMoaAccount([accountAddress]), true);
    assert.deepEqual(await factory.read.accountsOf([owners[4]]), [accountAddress]);
    const storedOwners = (await account.read.owners()) as readonly Address[];
    assert.deepEqual(
      storedOwners.map((owner) => owner.toLowerCase()),
      owners.map((owner) => owner.toLowerCase()),
    );
    assert.equal(await account.read.THRESHOLD(), 3n);
  });

  it("requires the creator to be one of the owners", async function () {
    const wallets = await viem.getWalletClients();
    const owners = [
      wallets[1].account.address,
      wallets[2].account.address,
      wallets[3].account.address,
      wallets[4].account.address,
      wallets[5].account.address,
    ] as const;
    const factory = await viem.deployContract("MoaFactory");

    await viem.assertions.revertWithCustomErrorWithArgs(
      factory.write.createAccount([owners]),
      factory,
      "CreatorNotOwner",
      [wallets[0].account.address],
    );
  });
});
