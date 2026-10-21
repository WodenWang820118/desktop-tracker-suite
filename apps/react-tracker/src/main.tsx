import { StrictMode } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { PrimeReactProvider } from 'primereact/api';
import App from './app/app';
import './styles.css';
import { themes } from './themes';

// Load the appropriate PrimeReact theme based on initial theme preference
const loadTheme = () => {
  const saved = localStorage.getItem('theme');
  const prefersDark = globalThis.matchMedia?.(
    '(prefers-color-scheme: dark)',
  ).matches;
  const useDark = saved ? saved === 'dark' : prefersDark;

  const themeUrl = useDark ? themes.dark : themes.light;

  const link = document.createElement('link');
  link.id = 'app-theme';
  link.rel = 'stylesheet';
  link.href = themeUrl;
  document.head.appendChild(link);
};

loadTheme();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <PrimeReactProvider>
      {globalThis.location?.protocol === 'file:' ? (
        <HashRouter>
          <App />
        </HashRouter>
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </PrimeReactProvider>
  </StrictMode>,
);
