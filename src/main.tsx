import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {LanguageProvider} from './state/LanguageProvider';
import {RouterProvider} from './lib/router';
import {applyTheme, storedTheme} from './state/theme';
import './styles/app.css';

applyTheme(storedTheme());

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <LanguageProvider>
            <RouterProvider>
                <App/>
            </RouterProvider>
        </LanguageProvider>
    </StrictMode>,
);
