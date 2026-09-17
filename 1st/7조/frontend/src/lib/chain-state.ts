export const CHAIN_STATE_CHANGED_EVENT = 'crb:chain-state-changed';

export function notifyChainStateChanged() {
  window.dispatchEvent(new Event(CHAIN_STATE_CHANGED_EVENT));
}
