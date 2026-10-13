import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import {
  BLOCKCHAIN_CLIENT,
  createBlockchainConnection,
} from './blockchain.client';
@Module({
  providers: [
    { provide: BLOCKCHAIN_CLIENT, useFactory: createBlockchainConnection },
    BlockchainService,
  ],
  exports: [BlockchainService],
})
export class BlockchainModule {}
