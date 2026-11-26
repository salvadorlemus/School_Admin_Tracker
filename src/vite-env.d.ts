/// <reference types="vite/client" />

/** Settings read from .env.local (see .env.example). */
interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
    /** Production only (Render): the app's and the admin panel's own addresses (src/lib/hosts.ts). */
    readonly VITE_APP_HOST?: string;
    readonly VITE_ADMIN_HOST?: string;
}

/** The app's version (package.json), set at build time. */
declare const __APP_VERSION__: string;

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
