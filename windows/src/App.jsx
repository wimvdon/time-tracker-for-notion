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

  useEffect(() => {
    init();
  }, [init]);

  // "Stop timer" from the tray menu
  useEffect(() => {
    return window.notionAPI.onTrayStopTimer(() => {
      useStore.getState().stopTimer();
    });
  }, []);

  return (
    <div className="h-full flex flex-col">
      {view === 'settings' ? <Settings /> : <Timer />}
      {recoveredTimer && <RecoveryModal />}
      <Toasts />
    </div>
  );
}
