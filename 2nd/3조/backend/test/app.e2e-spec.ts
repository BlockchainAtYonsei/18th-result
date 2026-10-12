import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BLOCKCHAIN_CLIENT } from '../src/blockchain/blockchain.client';
import { ContractFunctionRevertedError } from 'viem';
import { configureApp } from '../src/common/http';

const address = '0x' + 'Ab'.repeat(20);
const normalized = address.toLowerCase();
const txHash = '0x' + 'CD'.repeat(32);
function mockPrisma() {
  return {
    accountMetadata: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    proposalMetadata: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    walletProfile: { findUnique: jest.fn(), upsert: jest.fn() },
    activity: { findMany: jest.fn(), upsert: jest.fn() },
  };
}
describe('Moa metadata APIs', () => {
  let app: INestApplication;
  let db: ReturnType<typeof mockPrisma>;
  let chain: {
    readContract: jest.Mock;
    getBalance: jest.Mock;
    getChainId: jest.Mock;
  };
  beforeEach(async () => {
    db = mockPrisma();
    chain = {
      getChainId: jest.fn().mockResolvedValue(11155111),
      getBalance: jest.fn().mockResolvedValue(9007199254740993n),
      readContract: jest.fn().mockImplementation(({ functionName }) =>
        Promise.resolve(
          {
            isMoaAccount: true,
            accountsOf: [normalized],
            owners: [normalized],
            THRESHOLD: 3n,
            proposalCount: 2n,
            getProposal: {
              proposer: normalized,
              target: normalized,
              value: 1n,
              data: '0x',
              intentHash: txHash.toLowerCase(),
              approvalCount: 0n,
              status: 0,
              createdAt: 1700000000n,
            },
            hasApproved: false,
          }[functionName as string],
        ),
      ),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BLOCKCHAIN_CLIENT)
      .useValue({ client: chain, factory: normalized })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('creates and reads normalized account metadata without chain claims', async () => {
    db.accountMetadata.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );
    const response = await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        address,
        creator: address,
        name: ' 공동계좌 ',
        creationTxHash: txHash,
      })
      .expect(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        source: 'offchain_metadata',
        blockchain: { status: 'configured' },
        metadata: {
          address: normalized,
          creator: normalized,
          name: '공동계좌',
          creationTxHash: txHash.toLowerCase(),
        },
      },
    });
    db.accountMetadata.findUnique.mockResolvedValue(
      response.body.data.metadata,
    );
    await request(app.getHttpServer())
      .get('/api/accounts/' + address)
      .expect(200);
    expect(db.accountMetadata.findUnique).toHaveBeenLastCalledWith({
      where: { address: normalized },
    });
  });
  it('updates only account name and lists metadata', async () => {
    db.accountMetadata.findUnique.mockResolvedValue({ address: normalized });
    db.accountMetadata.update.mockResolvedValue({
      address: normalized,
      name: '수정',
    });
    db.accountMetadata.findMany.mockResolvedValue([]);
    await request(app.getHttpServer())
      .patch('/api/accounts/' + address)
      .send({ name: '수정' })
      .expect(200);
    expect(db.accountMetadata.update).toHaveBeenCalledWith({
      where: { address: normalized },
      data: { name: '수정' },
    });
    await request(app.getHttpServer()).get('/api/accounts').expect(200);
  });
  it('discovers owner accounts without metadata and reads security', async () => {
    db.accountMetadata.findMany.mockResolvedValue([]);
    const owner = await request(app.getHttpServer())
      .get('/api/accounts')
      .query({ owner: address })
      .expect(200);
    expect(owner.body.data.items[0]).toMatchObject({
      address: normalized,
      metadata: null,
      state: { balance: '9007199254740993', threshold: '3' },
    });
    const security = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/1/security`)
      .expect(200);
    expect(security.body.data).toMatchObject({
      thresholdReached: false,
      status: 'Pending',
    });
    expect(security.body.data).not.toHaveProperty('executionMatch');
  });
  it('creates and reads proposal metadata with composite key', async () => {
    db.accountMetadata.findUnique.mockResolvedValue({ address: normalized });
    db.proposalMetadata.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );
    const response = await request(app.getHttpServer())
      .post(`/api/accounts/${address}/proposals`)
      .send({
        proposalId: '1',
        purpose: ' 식비 ',
        memo: '회식',
        creationTxHash: txHash,
      })
      .expect(201);
    expect(response.body.data.metadata).toMatchObject({
      accountAddress: normalized,
      proposalId: '1',
      purpose: '식비',
    });
    db.proposalMetadata.findUnique.mockResolvedValue(
      response.body.data.metadata,
    );
    await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/1`)
      .expect(200);
    expect(db.proposalMetadata.findUnique).toHaveBeenLastCalledWith({
      where: {
        accountAddress_proposalId: {
          accountAddress: normalized,
          proposalId: '1',
        },
      },
    });
    db.proposalMetadata.findMany.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals`)
      .expect(200);
  });
  it('reads proposals without metadata and sanitizes RPC failures', async () => {
    db.proposalMetadata.findMany.mockResolvedValue([]);
    const detail = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/0`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      metadata: null,
      state: {
        proposalId: '0',
        status: 'Pending',
        value: '1',
        createdAt: '1700000000',
      },
    });
    const list = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.items[0]).toMatchObject({
      proposalId: '0',
      metadata: null,
    });
    chain.getBalance.mockRejectedValue(new Error('internal configuration'));
    const failure = await request(app.getHttpServer())
      .get(`/api/accounts/${address}`)
      .expect(503);
    expect(failure.body).toEqual({
      success: false,
      error: {
        code: 'BLOCKCHAIN_RPC_FAILED',
        message: 'Blockchain 상태를 조회하지 못했습니다.',
      },
    });
    await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/invalid`)
      .expect(400);
  });
  it('upserts and reads profile', async () => {
    db.walletProfile.upsert.mockResolvedValue({
      address: normalized,
      name: '민수',
    });
    await request(app.getHttpServer())
      .put('/api/profiles/' + address)
      .send({ name: ' 민수 ' })
      .expect(200);
    expect(db.walletProfile.upsert).toHaveBeenCalledWith({
      where: { address: normalized },
      create: { address: normalized, name: '민수' },
      update: { name: '민수' },
    });
    db.walletProfile.findUnique.mockResolvedValue({
      address: normalized,
      name: '민수',
    });
    await request(app.getHttpServer())
      .get('/api/profiles/' + address)
      .expect(200);
  });
  it('scopes activity pagination and safely serializes BigInt', async () => {
    db.accountMetadata.findUnique.mockResolvedValue({ address: normalized });
    db.proposalMetadata.findUnique.mockResolvedValue({ proposalId: '1' });
    db.activity.findMany.mockResolvedValue([
      { id: 9007199254740993n, blockNumber: 9999999999999999n },
      { id: 2n },
    ]);
    const response = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/1/activities`)
      .query({ size: 1, cursor: '9007199254740994' })
      .expect(200);
    expect(response.body.data.items[0]).toEqual({
      id: '9007199254740993',
      blockNumber: '9999999999999999',
    });
    expect(response.body.data.nextCursor).toBe('9007199254740993');
    expect(db.activity.findMany).toHaveBeenCalledWith({
      where: {
        accountAddress: normalized,
        proposalId: '1',
        id: { lt: 9007199254740994n },
      },
      orderBy: { id: 'desc' },
      take: 2,
    });
    db.activity.findMany.mockResolvedValue([]);
    const empty = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/activities`)
      .expect(200);
    expect(empty.body.data).toMatchObject({ items: [], nextCursor: null });
  });
  it('returns on-chain and profile not found errors', async () => {
    chain.readContract.mockResolvedValue(false);
    const account = await request(app.getHttpServer())
      .get('/api/accounts/' + address)
      .expect(404);
    expect(account.body).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_NOT_FOUND' },
    });
    await request(app.getHttpServer())
      .get('/api/profiles/' + address)
      .expect(404);
    chain.readContract.mockImplementation(({ functionName }) => {
      if (functionName === 'isMoaAccount') return Promise.resolve(true);
      const error = new ContractFunctionRevertedError({
        abi: [],
        functionName: 'getProposal',
      });
      Object.defineProperty(error, 'data', {
        value: { errorName: 'ProposalNotFound' },
      });
      return Promise.reject(error);
    });
    const proposal = await request(app.getHttpServer())
      .get(`/api/accounts/${address}/proposals/1`)
      .expect(404);
    expect(proposal.body.error.code).toBe('PROPOSAL_NOT_FOUND');
  });
  it('rejects invalid addresses, unknown fields, names, tx hashes and pagination', async () => {
    await request(app.getHttpServer()).get('/api/accounts/invalid').expect(400);
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ address, creator: address, name: ' ', threshold: 3 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({
        address,
        creator: address,
        name: '계좌',
        creationTxHash: '0x1234',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/accounts/${address}/proposals`)
      .send({ proposalId: ' ', purpose: '' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/profiles/' + address)
      .send({ name: '' })
      .expect(400);
    for (const query of [
      { size: 0 },
      { size: 'abc' },
      { cursor: '-1' },
      { cursor: '99999999999999999999' },
    ]) {
      await request(app.getHttpServer())
        .get(`/api/accounts/${address}/activities`)
        .query(query)
        .expect(400);
    }
  });
  it('handles identical retries and conflicting account/proposal metadata', async () => {
    const existing = {
      address: normalized,
      creator: normalized,
      name: '계좌',
      creationTxHash: null,
    };
    db.accountMetadata.findUnique.mockResolvedValue(existing);
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ address, creator: address, name: '계좌' })
      .expect(201);
    expect(db.accountMetadata.create).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/api/accounts')
      .send({ address, creator: address, name: '다른 이름' })
      .expect(409);
    db.proposalMetadata.findUnique.mockResolvedValue({
      purpose: '식비',
      recipientLabel: null,
      memo: null,
      creationTxHash: null,
    });
    await request(app.getHttpServer())
      .post(`/api/accounts/${address}/proposals`)
      .send({ proposalId: '1', purpose: '식비' })
      .expect(201);
    expect(db.proposalMetadata.create).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`/api/accounts/${address}/proposals`)
      .send({ proposalId: '1', purpose: '다른 목적' })
      .expect(409);
  });
});
