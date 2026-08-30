/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
