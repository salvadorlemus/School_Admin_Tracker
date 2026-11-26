import {createClient} from '@supabase/supabase-js';

/**
 * The one Supabase client for the page. It uses the publishable key, which is safe in the browser:
 * what each request may read or change is decided by the database's row-level security policies
 * (supabase/migrations), not by this code.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Whether the build has the project's settings; without them only the prototype runs (nobody can sign in). */
export const supabaseReady = Boolean(url && key);

if (!supabaseReady) {
    console.error('Lyra: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are missing from this build. Locally, copy .env.example to .env.local; on Render, add them to the environment and redeploy.');
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing');
