/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTIVITY_LOG_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
