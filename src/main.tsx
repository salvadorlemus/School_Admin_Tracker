import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {LanguageProvider} from './state/LanguageProvider';
import {RouterProvider} from './lib/router';
import {applyTheme, storedTheme} from './state/theme';
import './styles/app.css';

applyTheme(storedTheme());
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
