import { config } from './config';

export type Activity = {
  id: string;
  type: string;
  actor?: { address: string; name?: string };
  createdAt: string;
};

export type ProposalMetadata = {
  proposalId: string;
  purpose: string;
  recipientLabel?: string | null;
  memo?: string | null;
  creationTxHash?: string | null;
  createdAt: string;
};

export type WalletProfile = {
  address: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

async function assertApiResponse(response: Response, fallback: string) {
  if (response.ok) return;
  let message = fallback;
  try {
    const body = await response.json() as { error?: { message?: string } };
    message = body.error?.message || message;
  } catch {
    // Keep the feature-specific fallback when the server returns a non-JSON error.
  }
  throw new Error(message);
}

export async function getAccountMetadata(address: string) {
  if (!config.backendUrl) return null;
  const response = await fetch(config.backendUrl + '/api/accounts/' + address);
  if (!response.ok) throw new Error('Account 정보를 불러오지 못했습니다.');
  const body = await response.json();
  return body.data?.metadata ?? body.data;
}

export async function getActivities(address: string): Promise<Activity[]> {
  if (!config.backendUrl) return [];
  const response = await fetch(config.backendUrl + '/api/accounts/' + address + '/activities');
  if (!response.ok) throw new Error('Activity를 불러오지 못했습니다.');
  const body = await response.json();
  const items = body.data.items || body.data;
  return items.map((item: Activity & { actor?: string | { address: string; name?: string } }) => ({
    ...item,
    actor: typeof item.actor === 'string' ? { address: item.actor } : item.actor,
  }));
}

export async function getProposalMetadata(address: string, proposalId: number): Promise<ProposalMetadata | null> {
  if (!config.backendUrl) return null;
  const response = await fetch(config.backendUrl + '/api/accounts/' + address + '/proposals/' + proposalId);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Proposal 정보를 불러오지 못했습니다.');
  const body = await response.json();
  return body.data?.metadata ?? body.data;
}

export async function getProposalMetadataList(address: string): Promise<ProposalMetadata[]> {
  if (!config.backendUrl) return [];
  const response = await fetch(config.backendUrl + '/api/accounts/' + address + '/proposals');
  if (!response.ok) throw new Error('Proposal 목록을 불러오지 못했습니다.');
  const body = await response.json();
  return body.data?.items ?? body.data ?? [];
}

export async function saveAccountMetadata(address: string, name: string, creator: string, txHash: string) {
  if (!config.backendUrl) return;
  const response = await fetch(config.backendUrl + '/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, name, creator, creationTxHash: txHash }),
  });
  await assertApiResponse(response, 'Account metadata를 저장하지 못했습니다.');
}

export async function saveProposalMetadata(
  address: string,
  proposalId: number,
  purpose: string,
  recipientLabel: string,
  memo: string,
  txHash: string,
) {
  if (!config.backendUrl) return;
  const response = await fetch(config.backendUrl + '/api/accounts/' + address + '/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: String(proposalId), purpose, recipientLabel, memo, creationTxHash: txHash }),
  });
  await assertApiResponse(response, 'Proposal metadata를 저장하지 못했습니다.');
}

export async function getWalletProfile(address: string): Promise<WalletProfile | null> {
  if (!config.backendUrl) return null;
  const response = await fetch(config.backendUrl + '/api/profiles/' + address);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Wallet Profile을 불러오지 못했습니다.');
  const body = await response.json();
  return body.data ?? null;
}

export async function saveWalletProfile(address: string, name: string) {
  if (!config.backendUrl) return null;
  const response = await fetch(config.backendUrl + '/api/profiles/' + address, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await assertApiResponse(response, 'Wallet Profile을 저장하지 못했습니다.');
  const body = await response.json();
  return body.data as WalletProfile;
}
