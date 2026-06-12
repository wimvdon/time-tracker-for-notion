import { useStore } from '../store/useStore.js';
import { formatHHMM } from '../lib/format.js';
import { t } from '../lib/i18n.js';

export default function RecoveryModal() {
  const recovered = useStore((s) => s.recoveredTimer);
  const busy = useStore((s) => s.recoveryBusy);
  const resume = useStore((s) => s.resumeRecoveredTimer);
  const stopNow = useStore((s) => s.stopRecoveredTimer);
  const discard = useStore((s) => s.discardRecoveredTimer);

  if (!recovered) return null;

  const start = new Date(recovered.roundedStart);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 w-full flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('recoveryTitle')}</h2>
        <p className="text-xs text-zinc-300">{t('recoveryBody')}</p>
        <p className="text-xs text-zinc-400">
          {recovered.projectName && (
            <span className="font-semibold">{recovered.projectName} · </span>
          )}
          <span className="font-semibold tabular-nums">{formatHHMM(start)}</span>
        </p>
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={stopNow}
            disabled={busy}
            className="w-full py-2 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold"
          >
            {t('recoveryStop')}
          </button>
          <button
            onClick={resume}
            disabled={busy}
            className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
          >
            {t('recoveryResume')}
          </button>
          <button
            onClick={discard}
            disabled={busy}
            className="w-full py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm"
          >
            {t('recoveryDiscard')}
          </button>
        </div>
      </div>
    </div>
  );
}
