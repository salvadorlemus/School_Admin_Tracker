// Makes the worker's password (WORKER_SECRET), saves it as a Supabase secret, and writes the SQL that
// gives the same value to the database's vault into supabase/.temp/worker-secret.sql (git-ignored).
// Paste that file into Supabase's SQL Editor, run it, then delete the file.
//
//   node --env-file=.env.local scripts/worker-secret.mjs

import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';

const project = process.env.VITE_SUPABASE_URL;
if (!project) {
    console.error('Run it with --env-file=.env.local (it reads the project URL from there).');
    process.exit(1);
}
const secret = randomBytes(32).toString('hex');
const set = spawnSync(`npx supabase secrets set --yes WORKER_SECRET=${secret} APP_URL=https://lyra.kokoasoft.com`, {
    shell: true,
    encoding: 'utf8'
});
if (set.status !== 0) {
    console.error('Could not save the secret in Supabase:', set.stderr || set.stdout);
    process.exit(1);
}

mkdirSync('supabase/.temp', {recursive: true});
writeFileSync('supabase/.temp/worker-secret.sql', `-- Paste into Supabase → SQL Editor → New query, click Run, then delete this file.
select vault.create_secret('${secret}', 'lyra_worker_key');
select vault.create_secret('${project}', 'lyra_project_url');
`);
console.log('Saved WORKER_SECRET in Supabase.');
console.log('Next: open supabase/.temp/worker-secret.sql, paste it into the SQL Editor (after the push), run it, then delete the file.');
