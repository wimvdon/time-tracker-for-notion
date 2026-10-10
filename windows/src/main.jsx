import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Appearance from the main process (see createWindow): whether the window has
// a Mica backdrop, and the Windows accent colour.
const params = new URLSearchParams(window.location.search);
const root = document.documentElement;
if (params.get('mica') === '1') root.classList.add('mica');
const setAccent = (color) => {
  if (/^#[0-9a-f]{6}$/i.test(color || '')) root.style.setProperty('--fl-accent-base', color);
};
setAccent(params.get('accent'));
window.notionAPI?.onAccentColorChanged?.(setAccent);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
