import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatEther, isAddress, type Address } from 'viem';
import {
  approveTransaction,
  cancelProposal,
  connectWallet,
  createAccount,
  createProposal,
  deposit,
  executeTransaction,
  executeWithPayload,
  getAuthorizedWallet,
  makeIntentHash,
  readAccountState,
  readApprovalBatch,
  readFactoryAccounts,
  readProposal,
  readProposalBatch,
  readProposalCount,
} from './lib/contract';
import { config, hasAccountAddress, hasFactoryAddress } from './lib/config';
import { getActivities, getAccountMetadata, getProposalMetadataList, getWalletProfile, saveAccountMetadata, saveProposalMetadata, saveWalletProfile, type Activity } from './lib/api';

type View = 'home' | 'create-account' | 'account' | 'create-proposal' | 'proposal-detail' | 'result';
type ProposalStatus = 'PENDING' | 'READY' | 'EXECUTED' | 'BLOCKED' | 'CANCELLED';
type LiveStateStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

type Owner = {
  address: string;
  name: string;
  approved: boolean;
};

type Account = {
  address: Address;
  name: string;
  balance: string;
  owners: Owner[];
  threshold: number;
};

type Proposal = {
  id: number;
  proposer: Address;
  purpose: string;
  recipient: Address;
  recipientLabel: string;
  amount: string;
  expiresAt: number | null;
  status: ProposalStatus;
  approvalCount: number;
  threshold: number;
  intentHash: string;
  approvedOwners: string[];
  executionMatch: 'PASS' | 'FAIL' | null;
};

const demoOwners: Owner[] = [
  { address: '0x1111111111111111111111111111111111111111', name: '정연한', approved: true },
  { address: '0x2222222222222222222222222222222222222222', name: '최승원', approved: true },
  { address: '0x3333333333333333333333333333333333333333', name: '정윤호', approved: false },
  { address: '0x4444444444444444444444444444444444444444', name: '김다헌', approved: false },
  { address: '0x5555555555555555555555555555555555555555', name: '유태연', approved: false },
];

const demoAccount: Account = {
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  name: '제주도 여행',
  balance: '0.68',
  owners: demoOwners,
  threshold: 3,
};

const demoProposal: Proposal = {
  id: 1,
  proposer: demoOwners[0].address as Address,
  purpose: '제주도 숙소',
  recipient: '0x6666666666666666666666666666666666666666',
  recipientLabel: 'Hotel A',
  amount: '0.32',
  expiresAt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
  status: 'PENDING',
  approvalCount: 2,
  threshold: 3,
  intentHash: '0x8c2f…a83f',
  approvedOwners: [demoOwners[0].address, demoOwners[1].address],
  executionMatch: null,
};

const defaultOwners = demoOwners.map((owner) => owner.address);

function shorten(value: string, size = 5) {
  if (!value) return '연결되지 않음';
  return value.slice(0, size + 2) + '…' + value.slice(-size);
}

function formatDate(timestamp: number | null) {
  if (timestamp === null) return '컨트랙트 미지원';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function formatKrw(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('User rejected')) return '지갑 서명을 취소했어요.';
  if (message.includes('IntentMismatch')) return '승인한 내용과 실행 요청이 달라 실행이 차단됐어요.';
  if (message.includes('CreatorNotOwner')) return '공동계좌 생성자는 Owner 목록에 포함되어야 해요.';
  if (message.includes('NotOwner')) return '공동계좌 참여자만 실행할 수 있어요.';
  if (message.includes('AlreadyApproved')) return '이미 동의한 Proposal이에요.';
  if (message.includes('InsufficientApprovals')) return '아직 승인 수가 부족해요.';
  if (message.includes('NotProposer')) return 'Proposal을 만든 사람만 취소할 수 있어요.';
  if (message.includes('ProposalNotPending')) return '이미 종료된 Proposal이에요.';
  return message || '요청을 처리하지 못했어요.';
}

function hasContractError(error: unknown, name: string) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    if (typeof current === 'object' && current !== null && 'shortMessage' in current) {
      messages.push(String((current as { shortMessage?: unknown }).shortMessage));
    }
    if (typeof current === 'object' && current !== null && 'details' in current) {
      messages.push(String((current as { details?: unknown }).details));
    }
    current = typeof current === 'object' && current !== null && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return messages.some((message) => message.includes(name));
}

export function App() {
  const [view, setView] = useState<View>('home');
  const [walletAddress, setWalletAddress] = useState('');
  const [account, setAccount] = useState<Account>({
    ...demoAccount,
    address: hasAccountAddress ? config.accountAddress : demoAccount.address,
  });
  const [proposal, setProposal] = useState<Proposal>(demoProposal);
  const [proposals, setProposals] = useState<Proposal[]>([demoProposal]);
  const [showActiveProposals, setShowActiveProposals] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    { id: '1', type: 'THRESHOLD_REACHED', createdAt: '오늘 10:34' },
    { id: '2', type: 'PROPOSAL_APPROVED', actor: { address: demoOwners[1].address, name: '최승원' }, createdAt: '오늘 10:33' },
    { id: '3', type: 'PROPOSAL_CREATED', actor: { address: demoOwners[0].address, name: '정연한' }, createdAt: '오늘 10:31' },
  ]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileDraft, setProfileDraft] = useState('');
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [busy, setBusy] = useState('');
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [liveStateStatus, setLiveStateStatus] = useState<LiveStateStatus>('idle');
  const [factoryLookupComplete, setFactoryLookupComplete] = useState(!hasFactoryAddress || hasAccountAddress);
  const [depositAmount, setDepositAmount] = useState('0.10');
  const [accountName, setAccountName] = useState('제주도 여행');
  const [ownerInputs, setOwnerInputs] = useState(defaultOwners);
  const [ownerProfileNames, setOwnerProfileNames] = useState<Record<string, string>>({});
  const [proposalForm, setProposalForm] = useState({
    purpose: '제주도 숙소',
    recipient: demoProposal.recipient,
    recipientLabel: 'Hotel A',
    amount: '0.32',
    expiresAt: new Date((demoProposal.expiresAt ?? 0) * 1000).toISOString().slice(0, 16),
  });

  const hasConfiguredContracts = hasFactoryAddress || hasAccountAddress;
  const isLive = Boolean(walletAddress && (hasAccountAddress || (hasFactoryAddress && account.address !== demoAccount.address)));
  const approvalReady = proposal.approvalCount >= proposal.threshold;
  const isWalletOwner = Boolean(walletAddress && account.owners.some((owner) => owner.address.toLowerCase() === walletAddress.toLowerCase()));
  const canApproveExecute = !isLive || isWalletOwner;
  const canCancel = !isLive || Boolean(walletAddress && proposal.proposer.toLowerCase() === walletAddress.toLowerCase());
  const expirationPass = proposal.expiresAt === null ? null : proposal.expiresAt > Math.floor(Date.now() / 1000);
  const ownerAddressesKey = account.owners.map((owner) => owner.address.toLowerCase()).join('|');
  const ownerInputKey = ownerInputs.join('|').toLowerCase();
  const currentSecurity = useMemo(() => ({
    threshold: approvalReady,
    intent: true,
    expiration: expirationPass,
    executionMatch: proposal.executionMatch,
  }), [approvalReady, expirationPass, proposal.executionMatch]);

  async function applyWalletSession(address: Address) {
    setWalletAddress(address);
    setOwnerInputs((current) => current.map((owner, index) => index === 0 && owner.toLowerCase() === demoOwners[0].address.toLowerCase() ? address : owner));
    if (!config.backendUrl) return;
    try {
      const profile = await getWalletProfile(address);
      if (profile) {
        setProfileName(profile.name);
        setAccount((current) => ({
          ...current,
          owners: current.owners.map((owner) => owner.address.toLowerCase() === address.toLowerCase() ? { ...owner, name: profile.name } : owner),
        }));
      } else {
        setProfileDraft('');
        setShowProfilePrompt(true);
      }
    } catch {
      setNotice({ type: 'info', text: 'Wallet은 연결됐지만 Profile 서버를 확인하지 못했어요.' });
    }
  }

  useEffect(() => {
    let disposed = false;
    void getAuthorizedWallet().then((address) => {
      if (!disposed && address) void applyWalletSession(address);
    }).catch(() => undefined);

    const provider = window.ethereum;
    if (!provider?.on) return () => { disposed = true; };
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] : [];
      const address = typeof accounts[0] === 'string' ? accounts[0] as Address : null;
      if (!address) {
        setWalletAddress('');
        setShowProfilePrompt(false);
        return;
      }
      void applyWalletSession(address);
    };
    provider.on('accountsChanged', onAccountsChanged);
    return () => {
      disposed = true;
      provider.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, []);

  useEffect(() => {
    if (!config.backendUrl || !account.address) return;
    void getAccountMetadata(account.address).then((metadata) => {
      if (metadata?.name) setAccount((current) => ({ ...current, name: metadata.name }));
    }).catch(() => undefined);
    void getActivities(account.address).then((items) => {
      if (items.length > 0) setActivities(items);
    }).catch(() => undefined);
  }, [account.address]);

  useEffect(() => {
    if (!config.backendUrl || account.owners.length === 0) return;
    let disposed = false;
    void Promise.all(account.owners.map((owner) => getWalletProfile(owner.address).catch(() => null))).then((profiles) => {
      if (disposed) return;
      setAccount((current) => ({
        ...current,
        owners: current.owners.map((owner, index) => {
          const profile = profiles[index];
          const fallback = demoOwners.find((demoOwner) => demoOwner.address.toLowerCase() === owner.address.toLowerCase())?.name || shorten(owner.address);
          return { ...owner, name: profile?.name || fallback };
        }),
      }));
    });
    return () => { disposed = true; };
  }, [account.owners.length, ownerAddressesKey]);

  useEffect(() => {
    if (!config.backendUrl) return;
    const addresses = ownerInputs.filter((owner) => isAddress(owner));
    if (addresses.length === 0) {
      setOwnerProfileNames({});
      return;
    }
    let disposed = false;
    void Promise.all(addresses.map((address) => getWalletProfile(address).catch(() => null))).then((profiles) => {
      if (disposed) return;
      const names: Record<string, string> = {};
      addresses.forEach((address, index) => {
        const profile = profiles[index];
        if (profile?.name) names[address.toLowerCase()] = profile.name;
      });
      setOwnerProfileNames(names);
    });
    return () => { disposed = true; };
  }, [ownerInputKey]);

  useEffect(() => {
    if (!walletAddress || !hasFactoryAddress || hasAccountAddress || account.address !== demoAccount.address) return;
    let disposed = false;
    setFactoryLookupComplete(false);
    void readFactoryAccounts(walletAddress as Address).then((accounts) => {
      if (disposed) return;
      if (accounts.length > 0) {
        setAccount((current) => ({ ...current, address: accounts[accounts.length - 1] }));
      }
      setFactoryLookupComplete(true);
    }).catch(() => {
      if (!disposed) setFactoryLookupComplete(true);
    });
    return () => { disposed = true; };
  }, [walletAddress, account.address]);

  useEffect(() => {
    if (!isLive) {
      setLiveStateStatus('idle');
      return;
    }
    let disposed = false;
    setLiveStateStatus((current) => current === 'ready' ? 'refreshing' : 'loading');
    async function syncLiveState() {
      const [state, proposalCount, metadata] = await Promise.all([
        readAccountState(account.address),
        readProposalCount(account.address),
        getProposalMetadataList(account.address).catch(() => []),
      ]);
      const proposalIds = Array.from({ length: Number(proposalCount) }, (_, proposalId) => proposalId);
      const records = await readProposalBatch(account.address, proposalIds);
      const approvalValues = await readApprovalBatch(account.address, proposalIds, state.owners);
      const approvals = proposalIds.map((_, proposalIndex) => approvalValues.slice(proposalIndex * state.owners.length, (proposalIndex + 1) * state.owners.length));
      if (disposed) return;

      const metadataById = new Map(metadata.map((item) => [item.proposalId, item]));
      const nextProposals: Proposal[] = records.map((record, index) => {
        const proposalId = index;
        const approvalCount = Number(record.approvalCount);
        const proposalMetadata = metadataById.get(String(proposalId));
        const status: ProposalStatus = record.status === 1
          ? 'EXECUTED'
          : record.status === 2
            ? 'CANCELLED'
            : approvalCount >= state.threshold ? 'READY' : 'PENDING';
        return {
          id: proposalId,
          proposer: record.proposer,
          purpose: proposalMetadata?.purpose || '지출 제안 #' + proposalId,
          recipient: record.target,
          recipientLabel: proposalMetadata?.recipientLabel || shorten(record.target),
          amount: formatEther(record.value),
          expiresAt: null,
          status,
          approvalCount,
          threshold: state.threshold,
          intentHash: record.intentHash,
          approvedOwners: state.owners.filter((_, ownerIndex) => approvals[index][ownerIndex]).map(String),
          executionMatch: null,
        };
      });

      setAccount((current) => ({
        ...current,
        balance: state.balance,
        threshold: state.threshold,
        owners: state.owners.map((address) => {
          const fallback = demoOwners.find((owner) => owner.address.toLowerCase() === address.toLowerCase())?.name || shorten(address);
          return { address, name: fallback, approved: false };
        }),
      }));
      setProposals(nextProposals);
      if (nextProposals.length > 0) {
        setProposal((current) => nextProposals.find((item) => item.id === current.id) || nextProposals[nextProposals.length - 1]);
      }
      setLiveStateStatus('ready');
    }

    void syncLiveState().catch((error) => {
      if (disposed) return;
      setLiveStateStatus('error');
      setError(error);
    });
    return () => { disposed = true; };
  }, [account.address, isLive, liveRefreshKey]);

  useEffect(() => {
    if (!notice) return;

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  function setError(error: unknown) {
    setNotice({ type: 'error', text: formatError(error) });
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setError(error);
    } finally {
      setBusy('');
    }
  }

  async function handleConnect() {
    await run('connect', async () => {
      const address = await connectWallet();
      await applyWalletSession(address);
      setNotice({ type: 'success', text: 'Wallet이 연결됐어요.' });
    });
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    const name = profileDraft.trim();
    if (!name) {
      setNotice({ type: 'error', text: '표시 이름을 입력해주세요.' });
      return;
    }
    await run('profile', async () => {
      if (!walletAddress) throw new Error('Wallet을 먼저 연결해주세요.');
      const profile = await saveWalletProfile(walletAddress, name);
      setProfileName(profile?.name || name);
      setAccount((current) => ({
        ...current,
        owners: current.owners.map((owner) => owner.address.toLowerCase() === walletAddress.toLowerCase() ? { ...owner, name } : owner),
      }));
      setShowProfilePrompt(false);
      setNotice({ type: 'success', text: 'Wallet Profile을 저장했어요.' });
    });
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    const validOwners = ownerInputs.filter((owner) => isAddress(owner));
    if (validOwners.length !== 5 || new Set(validOwners.map((owner) => owner.toLowerCase())).size !== 5) {
      setNotice({ type: 'error', text: '서로 다른 유효한 Owner 주소 5개를 입력해주세요.' });
      return;
    }
    if (hasConfiguredContracts && (!walletAddress || !hasFactoryAddress)) {
      setNotice({ type: 'error', text: 'Factory와 Wallet 연결을 먼저 확인해주세요.' });
      return;
    }
    if (hasConfiguredContracts && walletAddress && !validOwners.some((owner) => owner.toLowerCase() === walletAddress.toLowerCase())) {
      setNotice({ type: 'error', text: '공동계좌 생성에 사용할 Owner 목록에 현재 연결된 Wallet을 포함해주세요.' });
      return;
    }

    await run('create-account', async () => {
      if (hasConfiguredContracts) {
        const created = await createAccount(validOwners as Address[]);
        setAccount((current) => ({ ...current, address: created.accountAddress }));
        setView('account');
        setNotice({ type: 'success', text: '공동계좌 생성 Transaction이 완료됐어요.' });
        try {
          await saveAccountMetadata(created.accountAddress, accountName, walletAddress, created.hash);
        } catch {
          setNotice({ type: 'info', text: '온체인 계좌는 생성됐지만 Account metadata 저장에 실패했어요.' });
        }
      } else {
        setNotice({ type: 'info', text: 'Demo 모드: Contract 주소가 없어 화면에서 계좌 생성을 확인했어요.' });
      }
      setAccount((current) => ({
        ...current,
        name: accountName,
        owners: validOwners.map((address, index) => ({
          address,
          name: ownerProfileNames[address.toLowerCase()] || demoOwners[index]?.name || 'Owner ' + (index + 1),
          approved: false,
        })),
      }));
      setView('account');
    });
  }

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      setNotice({ type: 'error', text: '입금 금액을 확인해주세요.' });
      return;
    }

    await run('deposit', async () => {
      if (hasConfiguredContracts && !isLive) {
        throw new Error('실제 Moa 계좌를 먼저 연결해주세요. Demo 잔액은 실제 입금이 아닙니다.');
      }
      if (isLive) {
        await deposit(account.address, depositAmount);
        setLiveRefreshKey((current) => current + 1);
      }
      setAccount((current) => ({ ...current, balance: (Number(current.balance) + amount).toFixed(2) }));
      setActivities((current) => [{ id: String(Date.now()), type: 'DEPOSIT', createdAt: '방금 전' }, ...current]);
      setNotice({ type: 'success', text: isLive ? '입금이 완료됐어요.' : 'Demo 모드: 입금 내역을 반영했어요.' });
    });
  }

  async function handleCreateProposal(event: FormEvent) {
    event.preventDefault();
    if (!isAddress(proposalForm.recipient)) {
      setNotice({ type: 'error', text: '유효한 Recipient 주소를 입력해주세요.' });
      return;
    }
    if (!Number(proposalForm.amount) || Number(proposalForm.amount) <= 0 || Number(proposalForm.amount) > Number(account.balance)) {
      setNotice({ type: 'error', text: '금액은 0보다 크고 공동계좌 잔액 이하여야 해요.' });
      return;
    }

    const expiresAt = Math.floor(new Date(proposalForm.expiresAt).getTime() / 1000);
    if (!isLive && (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000))) {
      setNotice({ type: 'error', text: '유효기간은 현재보다 이후여야 해요.' });
      return;
    }

    await run('create-proposal', async () => {
      if (hasConfiguredContracts && !isLive) {
        throw new Error('실제 Moa 계좌가 확인된 뒤 Proposal을 만들 수 있어요.');
      }
      let txHash = 'demo';
      let nextId = Math.max(0, ...proposals.map((item) => item.id)) + 1;
      let metadataSyncFailed = false;
      let intentHash = makeIntentHash(
        account.address,
        nextId,
        proposalForm.recipient as Address,
        proposalForm.amount,
      );
      if (isLive) {
        const created = await createProposal(account.address, proposalForm.recipient as Address, proposalForm.amount);
        txHash = created.hash;
        nextId = created.proposalId;
        intentHash = created.intentHash;
      }

      const nextProposal: Proposal = {
        id: nextId,
        proposer: (walletAddress || demoOwners[0].address) as Address,
        purpose: proposalForm.purpose,
        recipient: proposalForm.recipient as Address,
        recipientLabel: proposalForm.recipientLabel || shorten(proposalForm.recipient),
        amount: proposalForm.amount,
        expiresAt: isLive ? null : expiresAt,
        status: 'PENDING',
        approvalCount: 0,
        threshold: 3,
        intentHash,
        approvedOwners: [],
        executionMatch: null,
      };
      setProposal(nextProposal);
      setProposals((current) => [...current, nextProposal]);
      setActivities((current) => [{ id: String(Date.now()), type: 'PROPOSAL_CREATED', createdAt: '방금 전' }, ...current]);
      if (isLive) {
        try {
          await saveProposalMetadata(account.address, nextId, proposalForm.purpose, proposalForm.recipientLabel, '', txHash);
        } catch {
          metadataSyncFailed = true;
        }
        setLiveRefreshKey((current) => current + 1);
      }
      setNotice({
        type: metadataSyncFailed ? 'info' : 'success',
        text: metadataSyncFailed ? '온체인 Proposal은 생성됐지만 Proposal metadata 저장에 실패했어요.' : isLive ? 'Proposal이 생성됐어요.' : 'Demo 모드: Proposal이 생성됐어요.',
      });
      setView('proposal-detail');
    });
  }

  async function handleApprove() {
    await run('approve', async () => {
      if (hasConfiguredContracts && !isLive) throw new Error('실제 Moa 계좌가 확인된 뒤 승인할 수 있어요.');
      if (isLive && !isWalletOwner) throw new Error('NotOwner');
      let nextCount = proposal.approvalCount;
      let approvedOwners = proposal.approvedOwners;
      if (isLive) {
        await approveTransaction(account.address, proposal.id);
        const [latest, approvalValues] = await Promise.all([
          readProposal(account.address, proposal.id),
          readApprovalBatch(account.address, [proposal.id], account.owners.map((owner) => owner.address as Address)),
        ]);
        nextCount = Number(latest.approvalCount);
        approvedOwners = account.owners.filter((_, index) => approvalValues[index]).map((owner) => owner.address);
        setLiveRefreshKey((current) => current + 1);
      } else {
        const nextSigner = walletAddress || account.owners.find((owner) => !proposal.approvedOwners.includes(owner.address))?.address;
        approvedOwners = nextSigner && !proposal.approvedOwners.includes(nextSigner)
          ? [...proposal.approvedOwners, nextSigner]
          : proposal.approvedOwners;
        nextCount = Math.min(proposal.threshold, approvedOwners.length);
      }
      const nextProposal = {
        ...proposal,
        approvalCount: nextCount,
        approvedOwners,
        status: nextCount >= proposal.threshold ? 'READY' : 'PENDING',
      } as Proposal;
      setProposal(nextProposal);
      setProposals((current) => current.map((item) => item.id === proposal.id ? nextProposal : item));
      setActivities((current) => [{ id: String(Date.now()), type: nextCount >= proposal.threshold ? 'THRESHOLD_REACHED' : 'PROPOSAL_APPROVED', createdAt: '방금 전' }, ...current]);
      setNotice({ type: 'success', text: nextCount >= proposal.threshold ? 'Threshold를 충족했어요. 지출할 수 있어요.' : '동의가 기록됐어요.' });
    });
  }

  async function handleExecute() {
    await run('execute', async () => {
      if (hasConfiguredContracts && !isLive) throw new Error('실제 Moa 계좌가 확인된 뒤 실행할 수 있어요.');
      if (isLive && !isWalletOwner) throw new Error('NotOwner');
      if (!approvalReady) throw new Error('InsufficientApprovals');
      if (isLive) {
        await executeTransaction(account.address, proposal.id);
        setLiveRefreshKey((current) => current + 1);
      }
      const nextProposal = { ...proposal, status: 'EXECUTED', executionMatch: 'PASS' } as Proposal;
      setProposal(nextProposal);
      setProposals((current) => current.map((item) => item.id === proposal.id ? nextProposal : item));
      setActivities((current) => [{ id: String(Date.now()), type: 'PROPOSAL_EXECUTED', createdAt: '방금 전' }, ...current]);
      setNotice({ type: 'success', text: '지출이 완료됐어요.' });
      setView('result');
    });
  }

  async function handleCancel() {
    await run('cancel', async () => {
      if (hasConfiguredContracts && !isLive) throw new Error('실제 Moa 계좌가 확인된 뒤 취소할 수 있어요.');
      if (isLive && !canCancel) throw new Error('NotProposer');
      if (isLive) {
        await cancelProposal(account.address, proposal.id);
        setLiveRefreshKey((current) => current + 1);
      }
      const nextProposal = { ...proposal, status: 'CANCELLED' } as Proposal;
      setProposal(nextProposal);
      setProposals((current) => current.map((item) => item.id === proposal.id ? nextProposal : item));
      setActivities((current) => [{ id: String(Date.now()), type: 'PROPOSAL_CANCELLED', createdAt: '방금 전' }, ...current]);
      setNotice({ type: 'success', text: isLive ? 'Proposal을 취소했어요.' : 'Demo 모드: Proposal을 취소했어요.' });
    });
  }

  async function handleAttack() {
    if (!config.attackMode) {
      setNotice({ type: 'info', text: 'Attack Mode는 VITE_ATTACK_MODE=true일 때만 사용할 수 있어요.' });
      return;
    }

    await run('attack', async () => {
      if (hasConfiguredContracts && !isLive) throw new Error('실제 Moa 계좌가 확인된 뒤 Attack Path를 실행할 수 있어요.');
      const attacker = '0x9999999999999999999999999999999999999999' as Address;
      if (isLive) {
        try {
          await executeWithPayload(account.address, proposal.id, attacker, proposal.amount);
        } catch (error) {
          if (!hasContractError(error, 'IntentMismatch')) throw error;
        }
      }
      const nextProposal = { ...proposal, status: 'BLOCKED', executionMatch: 'FAIL' } as Proposal;
      setProposal(nextProposal);
      setProposals((current) => current.map((item) => item.id === proposal.id ? nextProposal : item));
      setActivities((current) => [{ id: String(Date.now()), type: 'EXECUTION_BLOCKED', createdAt: '방금 전' }, ...current]);
      setNotice({ type: 'error', text: '승인한 내용과 실행 요청이 달라 실행이 차단됐어요.' });
      setView('result');
    });
  }

  const nav = (next: View) => {
    setNotice(null);
    setView(next);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => nav('home')} aria-label="Moa 홈">
          <span className="brand-mark">M</span>
          <span>
            <strong>Moa</strong>
            <small>함께 모으고, 함께 결정하는 공동계좌</small>
          </span>
        </button>
        <div className="topbar-actions">
          <span className={'mode-pill ' + (isLive ? 'live' : '')}>
            <i />
            {isLive ? 'LIVE NETWORK' : hasConfiguredContracts && walletAddress ? 'ACCOUNT REQUIRED' : hasConfiguredContracts ? 'WALLET REQUIRED' : 'DEMO MODE'}
          </span>
          <button className="wallet-button" onClick={() => void handleConnect()} disabled={busy === 'connect'}>
            <span className="wallet-dot" />
            {walletAddress ? shorten(walletAddress) : 'Wallet 연결'}
          </button>
        </div>
      </header>

      <main className="main-content">
        {notice && <div className={'notice ' + notice.type}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}

        {hasConfiguredContracts && !walletAddress ? (
          <WalletRequiredPage busy={busy === 'connect'} onConnect={() => void handleConnect()} />
        ) : hasConfiguredContracts && walletAddress && !hasAccountAddress && !factoryLookupComplete ? (
          <NetworkLoadingPage />
        ) : hasConfiguredContracts && walletAddress && !hasAccountAddress && factoryLookupComplete && account.address === demoAccount.address && view !== 'create-account' ? (
          <NoAccountPage onCreate={() => nav('create-account')} />
        ) : isLive && (liveStateStatus === 'idle' || liveStateStatus === 'loading') ? (
          <NetworkLoadingPage />
        ) : isLive && liveStateStatus === 'error' ? (
          <NetworkErrorPage onRetry={() => setLiveRefreshKey((current) => current + 1)} />
        ) : <>
        {view === 'home' && (
          <HomePage account={account} proposals={proposals} onOpenAccount={() => nav('account')} onCreateAccount={() => nav('create-account')} onOpenProposal={() => nav('proposal-detail')} />
        )}

        {view === 'create-account' && (
          <CreateAccountPage
            name={accountName}
            owners={ownerInputs}
            ownerProfileNames={ownerProfileNames}
            busy={busy === 'create-account'}
            onNameChange={setAccountName}
            onOwnerChange={(index, value) => setOwnerInputs((current) => current.map((owner, ownerIndex) => ownerIndex === index ? value : owner))}
            onSubmit={handleCreateAccount}
            onBack={() => nav('home')}
          />
        )}

        {view === 'account' && (
          <AccountPage
            account={account}
            proposals={proposals}
            activities={activities}
            depositAmount={depositAmount}
            busy={busy}
            onDepositAmountChange={setDepositAmount}
            onDeposit={handleDeposit}
            onCreateProposal={() => nav('create-proposal')}
            onOpenAllProposals={() => setShowActiveProposals(true)}
            onOpenAllActivities={() => setShowActivities(true)}
            onSelectProposal={(proposalId) => {
              setShowActiveProposals(false);
              const selected = proposals.find((item) => item.id === proposalId);
              if (selected) setProposal(selected);
              nav('proposal-detail');
            }}
            onBack={() => nav('home')}
          />
        )}

        {view === 'create-proposal' && (
          <ProposalCreatePage
            account={account}
            form={proposalForm}
            live={isLive}
            busy={busy}
            onFormChange={(key, value) => setProposalForm((current) => ({ ...current, [key]: value }))}
            onCreate={handleCreateProposal}
            onBack={() => nav('account')}
          />
        )}

        {view === 'proposal-detail' && (
          <ProposalPage
            account={account}
            proposal={proposal}
            busy={busy}
            isLive={isLive}
            attackMode={config.attackMode}
            canApproveExecute={canApproveExecute}
            canCancel={canCancel}
            onApprove={() => void handleApprove()}
            onExecute={() => void handleExecute()}
            onAttack={() => void handleAttack()}
            onCancel={() => void handleCancel()}
            onBack={() => nav('account')}
          />
        )}

        {view === 'result' && (
          <ResultPage proposal={proposal} security={currentSecurity} onBack={() => nav('proposal-detail')} onHome={() => nav('home')} />
        )}

        {showActiveProposals && (
          <ActiveProposalsModal
            proposals={[...proposals].sort((left, right) => right.id - left.id)}
            onClose={() => setShowActiveProposals(false)}
            onSelect={(proposalId) => {
              setShowActiveProposals(false);
              const selected = proposals.find((item) => item.id === proposalId);
              if (selected) setProposal(selected);
              nav('proposal-detail');
            }}
          />
        )}

        {showActivities && (
          <ActivityModal
            activities={activities}
            onClose={() => setShowActivities(false)}
          />
        )}
        {showProfilePrompt && (
          <WalletProfileModal
            name={profileDraft}
            address={walletAddress}
            busy={busy === 'profile'}
            onChange={setProfileDraft}
            onSubmit={handleSaveProfile}
          />
        )}
        </>}
      </main>

      <footer className="footer">
        <span>MOA / 3-of-5 MULTISIG</span>
        <span>Intent-bound execution prototype</span>
      </footer>
    </div>
  );
}

function WalletRequiredPage({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return <section className="page narrow-page"><div className="form-card wallet-required-card"><p className="eyebrow">LIVE NETWORK</p><h1>Wallet을 연결해주세요.</h1><p>실제 Sepolia 컨트랙트로 데모를 진행하려면 MetaMask 연결이 필요해요.</p><button className="primary-button full-width" onClick={onConnect} disabled={busy}>{busy ? '연결 중…' : 'MetaMask 연결하기 ↗'}</button></div></section>;
}

function NoAccountPage({ onCreate }: { onCreate: () => void }) {
  return <section className="page narrow-page"><div className="form-card wallet-required-card"><p className="eyebrow">LIVE NETWORK</p><h1>공동계좌를 찾을 수 없어요.</h1><p>현재 연결된 Wallet이 Owner로 등록된 Moa 계좌가 없습니다. Profile 등록만으로는 공동계좌 멤버가 되지 않아요.</p><button className="primary-button full-width" onClick={onCreate}>새 공동계좌 만들기 ↗</button></div></section>;
}

function NetworkLoadingPage() {
  return <section className="page narrow-page"><div className="form-card wallet-required-card"><p className="eyebrow">LIVE NETWORK</p><h1>온체인 계좌를 확인하는 중…</h1><p>Factory와 Moa Account에서 실제 상태를 읽고 있어요. Demo 데이터는 사용하지 않습니다.</p></div></section>;
}

function NetworkErrorPage({ onRetry }: { onRetry: () => void }) {
  return <section className="page narrow-page"><div className="form-card wallet-required-card"><p className="eyebrow">LIVE NETWORK ERROR</p><h1>온체인 상태를 읽지 못했어요.</h1><p>RPC, 네트워크 또는 Contract 주소를 확인한 뒤 다시 시도해주세요.</p><button className="primary-button full-width" onClick={onRetry}>다시 조회하기 ↻</button></div></section>;
}

function WalletProfileModal({ name, address, busy, onChange, onSubmit }: {
  name: string;
  address: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return <div className="modal-backdrop" role="presentation"><section className="proposal-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-profile-title"><div className="modal-header"><div><p className="eyebrow">WALLET PROFILE</p><h2 id="wallet-profile-title">표시 이름을 정해주세요</h2></div></div><p className="profile-modal-description">공동계좌에서 다른 멤버에게 보여질 이름이에요.</p><p className="profile-modal-address">{shorten(address, 7)}</p><form onSubmit={onSubmit}><label className="field-label">표시 이름<input autoFocus value={name} onChange={(event) => onChange(event.target.value)} placeholder="예: 정윤호" maxLength={100} /></label><button className="primary-button full-width profile-submit" type="submit" disabled={busy}>{busy ? '저장 중…' : 'Profile 저장하기 ↗'}</button></form></section></div>;
}

function HomePage({ account, proposals, onOpenAccount, onCreateAccount, onOpenProposal }: {
  account: Account;
  proposals: Proposal[];
  onOpenAccount: () => void;
  onCreateAccount: () => void;
  onOpenProposal: () => void;
}) {
  const activeProposalCount = proposals.filter((item) => item.status === 'PENDING' || item.status === 'READY').length;

  return (
    <section className="page page-home">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">SHARED ASSET, SHARED DECISION</p>
          <h1>함께 모으고,<br /><em>함께 결정해요.</em></h1>
          <p className="hero-description">Moa는 충분한 서명뿐 아니라, 실제 실행이 모두가 합의한 내용과 같은지도 확인하는 공동계좌입니다.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenAccount}>내 공동계좌 보기 <span>↗</span></button>
            <button className="text-button" onClick={onCreateAccount}>새 Moa 만들기 <span>＋</span></button>
          </div>
        </div>
        <div className="hero-orbit">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-core"><span>3</span><small>of 5</small></div>
          <span className="orbit-label label-one">INTENT</span>
          <span className="orbit-label label-two">APPROVAL</span>
          <span className="orbit-label label-three">EXECUTION</span>
        </div>
      </div>

      <div className="section-heading">
        <div><p className="eyebrow">YOUR MOA</p><h2>내 공동계좌</h2></div>
        <span className="count-badge">01 ACTIVE</span>
      </div>

      <button className="account-card featured-card" onClick={onOpenAccount}>
        <div className="card-accent" />
        <div className="account-card-top"><span className="status-dot" /> ACTIVE ACCOUNT <span className="arrow">↗</span></div>
        <div className="account-card-title"><span>{account.name}</span><strong>{account.balance} <small>ETH</small></strong></div>
        <div className="account-card-meta">
          <span><b>5</b> MEMBERS</span>
          <span><b>{account.threshold}-of-5</b> THRESHOLD</span>
          <span><b>{activeProposalCount}</b> PENDING</span>
        </div>
        <div className="member-stack">
          {account.owners.map((owner) => <span key={owner.address} title={owner.name}>{owner.name.slice(0, 1)}</span>)}
          <label>5명이 함께하고 있어요</label>
        </div>
      </button>

      <div className="insight-strip">
        <div><span className="insight-icon">↯</span><span><b>이번 주 보안 상태</b><small>모든 실행 검증 통과</small></span></div>
        <div className="insight-stat"><strong>100%</strong><small>INTENT MATCH</small></div>
        <div className="insight-stat"><strong>0</strong><small>BLOCKED</small></div>
        <button onClick={onOpenProposal}>Proposal 확인 <span>→</span></button>
      </div>
    </section>
  );
}

function CreateAccountPage({ name, owners, ownerProfileNames, busy, onNameChange, onOwnerChange, onSubmit, onBack }: {
  name: string;
  owners: string[];
  ownerProfileNames: Record<string, string>;
  busy: boolean;
  onNameChange: (value: string) => void;
  onOwnerChange: (index: number, value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <section className="page narrow-page">
      <PageHeader eyebrow="CREATE A NEW MOA" title="새 공동계좌 만들기" description="5명의 Owner와 3명의 승인 기준으로 시작해요." onBack={onBack} />
      <form className="form-card" onSubmit={onSubmit}>
        <label className="field-label">공동계좌 이름<input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="예: 제주도 여행" /></label>
        <div className="form-section-title"><span>OWNERS</span><small>5명 중 3명 동의</small></div>
        <div className="owner-inputs">
          {owners.map((owner, index) => <label className="owner-input" key={index}><span>{index + 1}</span><div className="owner-input-field"><input value={owner} onChange={(event) => onOwnerChange(index, event.target.value)} placeholder="0x..." />{isAddress(owner) && <small>{ownerProfileNames[owner.toLowerCase()] || '등록된 Wallet Profile 없음'}</small>}</div></label>)}
        </div>
        <div className="threshold-preview"><span className="check-mark">✓</span><span><b>5명 중 3명이 동의하면 사용할 수 있어요.</b><small>Threshold는 MVP에서 3으로 고정돼요.</small></span></div>
        <button className="primary-button full-width" type="submit" disabled={busy}>{busy ? '생성 중…' : 'Moa 만들기 ↗'}</button>
      </form>
    </section>
  );
}

function AccountPage({ account, proposals, activities, depositAmount, busy, onDepositAmountChange, onDeposit, onCreateProposal, onOpenAllProposals, onOpenAllActivities, onSelectProposal, onBack }: {
  account: Account;
  proposals: Proposal[];
  activities: Activity[];
  depositAmount: string;
  busy: string;
  onDepositAmountChange: (value: string) => void;
  onDeposit: (event: FormEvent) => void;
  onCreateProposal: () => void;
  onOpenAllProposals: () => void;
  onOpenAllActivities: () => void;
  onSelectProposal: (proposalId: number) => void;
  onBack: () => void;
}) {
  const activeProposals = proposals.filter((item) => item.status === 'PENDING' || item.status === 'READY').sort((left, right) => right.id - left.id);

  return (
    <section className="page">
      <PageHeader eyebrow="ACCOUNT OVERVIEW" title={account.name} description="5명이 함께 관리하는 공동계좌" onBack={onBack} />
      <div className="account-overview-grid">
        <div className="balance-card dark-card"><span className="card-kicker">CURRENT BALANCE</span><strong>{account.balance}<small> ETH</small></strong><span className="balance-sub">≈ {formatKrw(Number(account.balance) * config.nativeTokenKrwRate)} <i>TESTNET</i></span><div className="balance-actions"><div className="deposit-control"><form onSubmit={onDeposit}><input value={depositAmount} onChange={(event) => onDepositAmountChange(event.target.value)} inputMode="decimal" /><button type="submit" disabled={busy === 'deposit'}>{busy === 'deposit' ? '…' : '입금'}</button></form><span className="deposit-conversion">입금 예정 금액 <b>≈ {formatKrw(Number(depositAmount) * config.nativeTokenKrwRate)}</b></span></div></div></div>
        <div className="consensus-column"><button className="proposal-launch standalone" onClick={onCreateProposal}>＋ 지출 제안</button><ConsensusCard account={account} activeProposals={activeProposals} onCreateProposal={onCreateProposal} onOpenAllProposals={onOpenAllProposals} onSelectProposal={onSelectProposal} /></div>
      </div>
      <div className="content-grid">
        <div className="panel"><div className="panel-heading"><div><span className="eyebrow">MEMBERS</span><h3>함께하는 사람들</h3></div><span className="small-count">5 MEMBERS</span></div><div className="member-list">{account.owners.map((owner) => <div className="member-row" key={owner.address}><span className="avatar">{owner.name.slice(0, 1)}</span><span><b>{owner.name}</b><small>{shorten(owner.address)}</small></span><em className="member-online"><i />ONLINE</em></div>)}</div></div>
        <div className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVITY LOG</span><h3>최근 활동</h3></div><span className="small-count">CoC</span></div><div className="timeline">{activities.slice(0, 5).map((activity) => <div className="timeline-row" key={activity.id}><span className="timeline-dot" /><span><b>{activityLabel(activity.type)}</b><small>{activityActorLabel(activity.actor)}{activity.createdAt}</small></span></div>)}</div><button className="consensus-view-all activity-view-all" onClick={onOpenAllActivities}>전체보기</button></div>
      </div>
    </section>
  );
}

function ActiveProposalsModal({ proposals, onClose, onSelect }: { proposals: Proposal[]; onClose: () => void; onSelect: (proposalId: number) => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="proposal-modal" role="dialog" aria-modal="true" aria-labelledby="active-proposals-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">ALL PROPOSALS</p><h2 id="active-proposals-title">전체 지출 제안</h2></div><button className="modal-close" onClick={onClose} aria-label="팝업 닫기">×</button></div>{proposals.length === 0 ? <div className="empty-proposals"><span>✓</span><b>아직 지출 제안이 없어요.</b><small>새 지출 제안을 만들어보세요.</small></div> : <div className="proposal-list">{proposals.map((item) => <button className="proposal-list-item" key={item.id} onClick={() => onSelect(item.id)}><span className="proposal-list-icon">↗</span><span className="proposal-list-copy"><b>{item.purpose}</b><small>{item.recipientLabel} · {item.amount} ETH</small></span><span className="proposal-list-votes">{item.approvalCount} / {item.threshold}<small>동의</small></span><span className={'status-chip ' + item.status.toLowerCase()}>{item.status === 'READY' ? 'READY' : item.status}</span><span className="proposal-list-arrow">→</span></button>)}</div>}<button className="modal-secondary" onClick={onClose}>닫기</button></section></div>;
}

function ActivityModal({ activities, onClose }: { activities: Activity[]; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="proposal-modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">ACTIVITY LOG</p><h2 id="activity-modal-title">전체 활동 내역</h2></div><button className="modal-close" onClick={onClose} aria-label="팝업 닫기">×</button></div>{activities.length === 0 ? <div className="empty-proposals"><span>✓</span><b>아직 활동 내역이 없어요.</b></div> : <div className="activity-modal-list">{activities.map((activity) => <div className="activity-modal-row" key={activity.id}><span className="timeline-dot" /><span><b>{activityLabel(activity.type)}</b><small>{activityActorLabel(activity.actor)}{activity.createdAt}</small></span></div>)}</div>}<button className="modal-secondary" onClick={onClose}>닫기</button></section></div>;
}

function ConsensusCard({ account, activeProposals, onCreateProposal, onOpenAllProposals, onSelectProposal }: { account: Account; activeProposals: Proposal[]; onCreateProposal: () => void; onOpenAllProposals: () => void; onSelectProposal: (proposalId: number) => void }) {
  const hasActiveProposal = activeProposals.length > 0;
  const visibleProposals = activeProposals.slice(0, 3);

  return <div className="threshold-card consensus-card"><div className="card-heading"><span>CONSENSUS</span><span className="live-badge">{activeProposals.length} ACTIVE</span></div>{hasActiveProposal ? <><div className="active-proposal-label">ALL ACTIVE PROPOSALS</div><div className="consensus-proposal-list">{visibleProposals.map((item) => <button className="consensus-proposal-row" key={item.id} onClick={() => onSelectProposal(item.id)}><span className="consensus-proposal-icon">↗</span><span className="consensus-proposal-copy"><b>{item.purpose}</b><small>{item.recipientLabel} · {item.amount} ETH</small></span><span className="consensus-proposal-votes"><b>{item.approvalCount} / {item.threshold}</b><small>동의</small></span><span className={'status-chip ' + item.status.toLowerCase()}>{item.status === 'READY' ? 'READY' : item.status}</span><span className="consensus-proposal-progress">{account.owners.map((owner) => <i key={owner.address} className={item.approvedOwners.includes(owner.address) ? 'approved' : ''} />)}</span></button>)}</div><button className="consensus-view-all" onClick={onOpenAllProposals}>전체보기</button></> : <><button className="consensus-empty" onClick={onCreateProposal}><span>＋</span><b>새 지출 제안을 만들어보세요</b><small>클릭해서 Proposal을 작성할 수 있어요.</small></button><button className="consensus-view-all" onClick={onOpenAllProposals}>전체보기</button></> }</div>;
}

function ProposalCreatePage({ account, form, live, busy, onFormChange, onCreate, onBack }: {
  account: Account;
  form: { purpose: string; recipient: string; recipientLabel: string; amount: string; expiresAt: string };
  live: boolean;
  busy: string;
  onFormChange: (key: string, value: string) => void;
  onCreate: (event: FormEvent) => void;
  onBack: () => void;
}) {
  return <section className="page narrow-page"><PageHeader eyebrow="NEW PROPOSAL" title="새 지출 제안" description="공동자금을 사용할 거래 조건을 작성해요." onBack={onBack} /><form className="proposal-create-card proposal-create-page-card" onSubmit={onCreate}><div className="proposal-form-heading"><span className="eyebrow">PROPOSAL INTENT</span><span className="step-label">01 / 01</span></div><div className="proposal-form-grid"><label>목적<input value={form.purpose} onChange={(event) => onFormChange('purpose', event.target.value)} placeholder="예: 제주도 숙소" /></label><label>금액<div className="input-suffix"><input value={form.amount} onChange={(event) => onFormChange('amount', event.target.value)} inputMode="decimal" /><span>ETH</span></div></label><label className="wide-field">받는 곳<input value={form.recipient} onChange={(event) => onFormChange('recipient', event.target.value)} placeholder="0x..." /></label><label>표시 이름<input value={form.recipientLabel} onChange={(event) => onFormChange('recipientLabel', event.target.value)} placeholder="예: Hotel A" /></label>{live ? <label>유효기간<span className="unsupported-field">컨트랙트에서 관리하지 않음</span></label> : <label>유효기간<input type="datetime-local" value={form.expiresAt} onChange={(event) => onFormChange('expiresAt', event.target.value)} /></label>}</div><div className="proposal-form-footer"><span>잔액 {account.balance} ETH · TRANSFER</span><button className="primary-button" type="submit" disabled={busy === 'create-proposal'}>{busy === 'create-proposal' ? '생성 중…' : 'Proposal 만들기 ↗'}</button></div></form></section>;
}

function ProposalPage({ account, proposal, busy, isLive, attackMode, canApproveExecute, canCancel, onApprove, onExecute, onAttack, onCancel, onBack }: {
  account: Account;
  proposal: Proposal;
  busy: string;
  isLive: boolean;
  attackMode: boolean;
  canApproveExecute: boolean;
  canCancel: boolean;
  onApprove: () => void;
  onExecute: () => void;
  onAttack: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const ready = proposal.approvalCount >= proposal.threshold;
  const isResult = proposal.status === 'EXECUTED' || proposal.status === 'BLOCKED';

  return (
    <section className="page">
      <PageHeader eyebrow={isResult ? 'EXECUTION RESULT' : 'PROPOSAL DETAIL'} title={isResult ? (proposal.status === 'EXECUTED' ? '지출이 완료됐어요.' : '실행이 차단됐어요.') : proposal.purpose} description={isResult ? '검증 결과를 확인해보세요.' : '거래 조건과 구성원 승인 현황을 확인해요.'} onBack={onBack} />
      <div className="proposal-detail-grid">
        <div className="proposal-main-card">
          <div className="proposal-card-top"><span className={'status-chip ' + proposal.status.toLowerCase()}>{proposal.status === 'READY' ? 'EXECUTABLE' : proposal.status}</span><span className="proposal-id">PROPOSAL #{String(proposal.id).padStart(2, '0')}</span></div>
          <h3>{proposal.purpose}</h3><strong className="proposal-amount">{proposal.amount}<small> ETH</small></strong>
          <div className="recipient-block"><span>RECIPIENT</span><b>{proposal.recipientLabel}</b><code>{shorten(proposal.recipient, 8)}</code></div>
          <div className="proposal-meta-row"><span><small>EXPIRES</small><b>{formatDate(proposal.expiresAt)}</b></span><span><small>ACTION</small><b>TRANSFER</b></span><span><small>INTENT HASH</small><b>{proposal.intentHash}</b></span></div>
          <div className="approval-progress"><div className="progress-label"><span>구성원 승인</span><b>{proposal.approvalCount} / {proposal.threshold}</b></div><div className="progress-track"><i style={{ width: Math.min(100, proposal.approvalCount / proposal.threshold * 100) + '%' }} /></div></div>
          <div className="approval-avatars">{account.owners.map((owner) => <span className={proposal.approvedOwners.includes(owner.address) ? 'approved' : ''} key={owner.address}>{owner.name.slice(0, 1)}</span>)}</div>
          {isLive && !canApproveExecute && <p className="permission-note">현재 연결된 Wallet은 이 공동계좌의 Owner가 아니어서 동의할 수 없어요. Owner 지갑으로 연결해주세요.</p>}
          {!isResult && proposal.status !== 'CANCELLED' && <div className="action-row"><button className="secondary-button" onClick={onApprove} disabled={!canApproveExecute || busy === 'approve' || ready}>{busy === 'approve' ? '서명 중…' : ready ? '동의 완료 ✓' : '동의하기'}</button><button className="primary-button" onClick={onExecute} disabled={!canApproveExecute || !ready || busy === 'execute'}>{busy === 'execute' ? '실행 중…' : '실행하기 ↗'}</button><button className="cancel-button" onClick={onCancel} disabled={!canCancel || busy === 'cancel'}>{busy === 'cancel' ? '취소 중…' : 'Proposal 취소'}</button></div>}
        </div>

        <div className="security-card"><div className="card-heading"><span>SECURITY LAYER</span><span className="lock-icon">⌁</span></div><p className="security-lead">서명은 충분했지만,<br /><b>합의한 거래인지 다시 확인해요.</b></p><SecurityRow label="Threshold" status={proposal.approvalCount >= proposal.threshold ? 'PASS' : 'WAIT'} value={proposal.approvalCount + ' / ' + proposal.threshold} /><SecurityRow label="Intent" status="PASS" value={shorten(proposal.intentHash, 7)} /><SecurityRow label="Expiration" status={proposal.expiresAt === null ? 'WAIT' : proposal.expiresAt > Math.floor(Date.now() / 1000) ? 'PASS' : 'FAIL'} value={formatDate(proposal.expiresAt)} /><SecurityRow label="Execution Match" status={proposal.executionMatch || 'WAIT'} value={proposal.executionMatch === 'FAIL' ? 'Recipient mismatch' : proposal.executionMatch === 'PASS' ? 'All fields match' : '검증 대기'} />{attackMode && !isResult && ready && canApproveExecute && <button className="attack-button" onClick={onAttack} disabled={busy === 'attack'}><span>⚠</span>{busy === 'attack' ? '공격 시뮬레이션 중…' : 'Attack Path 실행'}</button>}</div>
      </div>
    </section>
  );
}

function ResultPage({ proposal, security, onBack, onHome }: {
  proposal: Proposal;
  security: { threshold: boolean; intent: boolean; expiration: boolean | null; executionMatch: 'PASS' | 'FAIL' | null };
  onBack: () => void;
  onHome: () => void;
}) {
  const blocked = proposal.status === 'BLOCKED';
  return <section className="page result-page"><div className={'result-icon ' + (blocked ? 'blocked' : 'success')}>{blocked ? '!' : '✓'}</div><p className="eyebrow">{blocked ? 'EXECUTION BLOCKED' : 'TRANSACTION EXECUTED'}</p><h1>{blocked ? '실행이 차단됐어요.' : '지출이 완료됐어요.'}</h1><p className="result-description">{blocked ? '승인한 내용과 실제 실행 요청이 일치하지 않습니다.' : '모든 구성원이 합의한 내용으로 자산이 이동했습니다.'}</p>{blocked && <div className="mismatch-card"><div><span>승인한 대상</span><b>{proposal.recipientLabel}</b><code>{shorten(proposal.recipient)}</code></div><span className="mismatch-arrow">≠</span><div><span>실제 요청</span><b>Unknown</b><code>0x9999…9999</code></div></div>}<div className="result-checks"><SecurityRow label="Threshold" status={security.threshold ? 'PASS' : 'FAIL'} value={proposal.approvalCount + ' / ' + proposal.threshold} /><SecurityRow label="Intent" status={security.intent ? 'PASS' : 'FAIL'} value="승인된 Intent" /><SecurityRow label="Expiration" status={security.expiration === null ? 'WAIT' : security.expiration ? 'PASS' : 'FAIL'} value={security.expiration === null ? '컨트랙트 미지원' : security.expiration ? '유효함' : '만료됨'} /><SecurityRow label="Execution Match" status={security.executionMatch || 'WAIT'} value={blocked ? 'Recipient mismatch' : 'All fields match'} /></div><div className="result-actions"><button className="secondary-button" onClick={onBack}>Proposal로 돌아가기</button><button className="primary-button" onClick={onHome}>Home으로 이동 ↗</button></div></section>;
}

function SecurityRow({ label, status, value }: { label: string; status: string; value: string }) {
  return <div className="security-row"><span className="security-status">{status === 'PASS' ? '✓' : status === 'FAIL' ? '×' : '·'}</span><span><b>{label}</b><small>{value}</small></span><em className={status.toLowerCase()}>{status}</em></div>;
}

function PageHeader({ eyebrow, title, description, onBack }: { eyebrow: string; title: string; description: string; onBack: () => void }) {
  return <div className="page-header"><button className="back-button" onClick={onBack}>← BACK</button><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}

function activityLabel(type: string) {
  const labels: Record<string, string> = {
    ACCOUNT_CREATED: '공동계좌 생성',
    DEPOSIT: '공동계좌 입금',
    PROPOSAL_CREATED: '지출 제안 생성',
    PROPOSAL_APPROVED: '구성원 승인',
    THRESHOLD_REACHED: 'Threshold 충족',
    EXECUTION_REQUESTED: '실행 요청',
    EXECUTION_BLOCKED: '실행 차단',
    PROPOSAL_EXECUTED: '지출 실행 완료',
    PROPOSAL_CANCELLED: '지출 제안 취소',
  };
  return labels[type] || type;
}

function activityActorLabel(actor?: Activity['actor']) {
  if (!actor) return '';
  return (actor.name || shorten(actor.address)) + ' · ';
}
