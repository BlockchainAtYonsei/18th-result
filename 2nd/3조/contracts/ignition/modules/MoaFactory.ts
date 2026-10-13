import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MoaFactoryModule = buildModule("MoaFactoryModule", (module) => {
  const moaFactory = module.contract("MoaFactory");

  return { moaFactory };
});

export default MoaFactoryModule;
