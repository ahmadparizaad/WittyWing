import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Import fonts locally for offline reliability
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/700.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Prevent accidental service worker registration inside chrome-extension pages.
// Some libraries or dev tooling may attempt to register a service worker for PWA features.
// Chrome extension UI pages (chrome-extension://) cannot register service workers and
// attempting to do so results in a confusing 'Status code: 3' error.
// We override the register method in that environment to no-op so the dev tools
// or libraries won't attempt the registration here.
if (typeof window !== 'undefined' && window.location && window.location.protocol === 'chrome-extension:') {
  try {
    if ('serviceWorker' in navigator && typeof (navigator.serviceWorker as any).register === 'function') {
      // Replace register with a no-op that returns a rejected promise with a specific error.
      (navigator.serviceWorker as any).register = async () =>
        Promise.reject(new DOMException('Service worker registration disabled in extension UI', 'NotAllowedError'));
      console.debug('Service worker registration stubbed in chrome-extension context.');
    }
  } catch (e) {
    // Non-fatal; don't block the app if this stub cannot be applied
    console.warn('Could not apply SW registration stub:', e);
  }
}
