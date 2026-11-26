import {supabase} from './lib/supabase';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {LanguageProvider} from './state/LanguageProvider';
import {RouterProvider} from './lib/router';
import {applyTheme, storedTheme} from './state/theme';
import './styles/app.css';

applyTheme(storedTheme());

// The password email's link signs the person in (Supabase reads the link's tokens); they choose the new password next.
supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') window.location.replace('#/password/new');
});

// The keyboard's height (what the visual viewport loses at the bottom), for the layout to end above it.
const viewport = window.visualViewport;
if (viewport) {
    const follow = () => {
        const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        document.documentElement.style.setProperty('--keyboard', `${Math.round(covered)}px`);
        document.documentElement.toggleAttribute('data-keyboard', covered > 120);
    };
    viewport.addEventListener('resize', follow);
    viewport.addEventListener('scroll', follow);
}
// `?frame` shows the app inside a phone outline on a laptop (for reviewing the phone layout).
if (new URLSearchParams(location.search).has('frame')) document.documentElement.classList.add('framed');

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <LanguageProvider>
            <RouterProvider>
                <App/>
            </RouterProvider>
        </LanguageProvider>
    </StrictMode>,
);
