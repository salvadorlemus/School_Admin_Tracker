import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// One site: the app and the admin panel, each on its own address in production (src/lib/hosts.ts).
export default defineConfig({
    // Relative asset paths, so the built site works from any folder or subpath.
    base: './',
    plugins: [react()],
    // The version shown on the sign-in screen.
    define: {__APP_VERSION__: JSON.stringify(pkg.version)},
    server: {port: 5174},
});
