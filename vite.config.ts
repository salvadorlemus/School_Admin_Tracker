import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// One page for now; the platform admin panel gets its own page later, as in VetClinicTracker.
export default defineConfig({
    // Relative asset paths, so the built site works from any folder or subpath.
    base: './',
    plugins: [react()],
    server: {port: 5174},
});
