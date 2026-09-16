/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUBTITLE_API_BASE_URL?: string;
  readonly VITE_ANDROID_UPDATE_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
