/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Type declaration for firebase/messaging
declare module 'firebase/messaging' {
  export type Messaging = any;
  export function getMessaging(app?: any): Messaging;
  export function getToken(messaging: Messaging, options?: any): Promise<string>;
  export function onMessage(messaging: Messaging, callback: (payload: any) => void): () => void;
  export function deleteToken(messaging: Messaging): Promise<boolean>;
}

// Type declaration for heic2any
declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }

  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
  export default heic2any;
}