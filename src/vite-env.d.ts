/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __LIFEOS_PORTABLE__: boolean;
declare const __LIFEOS_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_FIREBASE_EMULATORS?: string;
  readonly VITE_COMMERCIAL_PILOT?: string;
  readonly VITE_COMMERCIAL_PILOT_SYNC?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
