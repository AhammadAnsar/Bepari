import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function ensureWritableFetchDescriptor(target: unknown) {
  if (!target || typeof target !== 'object') return;
  try {
    const desc = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (desc && typeof desc.get === 'function' && typeof desc.set !== 'function' && desc.configurable) {
      const currentGetter = desc.get;
      let customFetch: typeof window.fetch | null = null;
      Object.defineProperty(target, 'fetch', {
        configurable: true,
        enumerable: desc.enumerable !== false,
        get() {
          return customFetch || currentGetter.call(this);
        },
        set(fn: typeof window.fetch) {
          if (typeof fn === 'function') {
            customFetch = fn;
          }
        },
      });
    }
  } catch {
    // Ignore non-configurable property descriptors
  }
}

if (typeof window !== 'undefined') {
  ensureWritableFetchDescriptor(window);
  if (typeof Window !== 'undefined' && Window.prototype) {
    ensureWritableFetchDescriptor(Window.prototype);
  }
}

createRoot(document.getElementById('root')!).render(<App />);
