/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTIVITY_LOG_ENABLED?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
