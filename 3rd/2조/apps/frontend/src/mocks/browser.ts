import { setupWorker } from 'msw/browser'
import { createMockBackend, localMockStorage } from './backend'

// Browser mock for demos: a small delay makes progress visible, and state survives a reload.
export const mockBackend = createMockBackend({ queuedPolls: 1, runningPolls: 2, latencyMs: 200, storage: localMockStorage() })
export const worker = setupWorker(...mockBackend.handlers)
