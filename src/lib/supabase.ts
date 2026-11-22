import {createClient} from '@supabase/supabase-js';

/**
 * The one Supabase client for the page. It uses the publishable key, which is safe in the browser:
 * what each request may read or change is decided by the database's row-level security policies
 * (supabase/migrations), not by this code.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY: copy .env.example to .env.local.');
}

export const supabase = createClient(url, key);
