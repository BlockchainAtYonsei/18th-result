/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'backend'
  readonly VITE_API_BASE_URL?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_CONSTELLATION_MODELS?: string
  readonly VITE_DEMO_FIXTURES?: 'on' | 'off'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
