import { useEffect } from 'react';
import { useStore } from './store/useStore.js';
import Timer from './views/Timer.jsx';
import Settings from './views/Settings.jsx';
import Toasts from './components/Toasts.jsx';
import RecoveryModal from './components/RecoveryModal.jsx';

export default function App() {
  const view = useStore((s) => s.view);
  const recoveredTimer = useStore((s) => s.recoveredTimer);
  const init = useStore((s) => s.init);
  const stopTimer = useStore((s) => s.stopTimer);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    init();
  }, [init]);

  // Apply theme class to <html> element whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      // 'auto' — use system preference via CSS media query
      root.classList.remove('dark', 'light');
    }
  }, [theme]);

  // "Stop timer" from the tray menu
  useEffect(() => {
    return window.notionAPI.onTrayStopTimer(() => {
      useStore.getState().stopTimer();
    });
  }, [stopTimer]);

  return (
    <div className="h-full flex flex-col">
      {view === 'settings' ? <Settings /> : <Timer />}
      {recoveredTimer && <RecoveryModal />}
      <Toasts />
    </div>
  );
}
