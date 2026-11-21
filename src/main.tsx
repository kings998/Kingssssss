import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const isHopwebEnv =
  import.meta.env.VITE_HOPWEB === 'true' ||
  (typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' ||
      window.location.protocol === 'content:' ||
      window.location.pathname.endsWith('.html')));
const Router = isHopwebEnv ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
);
