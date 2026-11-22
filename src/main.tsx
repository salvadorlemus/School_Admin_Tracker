import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {LanguageProvider} from './state/LanguageProvider';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <LanguageProvider>
            <App/>
        </LanguageProvider>
    </StrictMode>,
);
