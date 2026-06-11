import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n.js';

/**
 * Searchable dropdown replacing plain <select>. The panel is rendered in a
 * portal so it is never clipped by overflow:hidden/auto ancestors.
 *
 * @param {string}   value         - Currently selected value ('' for none)
 * @param {fn}       onChange      - Called with the new string value
 * @param {Array}    options       - [{ value: string, label: string }]
 * @param {string}   [placeholder] - Shown in trigger when nothing is selected;
 *                                   also appears as the first "clear" option
 * @param {boolean}  [allowClear]  - Whether to show a "— none —" first option
 * @param {boolean}  [disabled]
 * @param {boolean}  [loading]     - Disables and shows placeholder while loading
 * @param {string}   [className]   - Applied to the outer wrapper div
 * @param {string}   [triggerClass] - Background class for the trigger button
 *                                    (default 'bg-zinc-900' for modals;
 *                                     pass 'bg-zinc-800' for the timer view)
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = '',
  allowClear = true,
  disabled = false,
  loading = false,
  className = '',
  triggerClass = 'bg-zinc-900',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [panelStyle, setPanelStyle] = useState({});
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  // When searching, only filter the real options (not the clear/placeholder item)
  const displayOptions =
    search.trim() === ''
      ? allowClear
        ? [{ value: '', label: placeholder || '—' }, ...options]
        : options
      : options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase())
        );

  const openPanel = () => {
    if (disabled || loading) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    });
    setSearch('');
    setOpen(true);
  };

  const closePanel = () => setOpen(false);

  const select = (val) => {
    onChange(val);
    closePanel();
  };

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  // Close when clicking outside the trigger (panel stops propagation itself)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const panel = open
    ? createPortal(
        <div
          style={panelStyle}
          className="fixed z-[9999] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl"
          // Prevent clicks inside the panel from reaching the document handler
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="p-1.5 border-b border-zinc-700">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('placeholderSearch')}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm placeholder-zinc-600 outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {displayOptions.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-zinc-500 italic">
                {t('searchNoResults')}
              </div>
            )}
            {displayOptions.map((o) => (
              <button
                key={o.value === '' ? '__empty__' : o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-zinc-700 ${
                  o.value !== '' && o.value === value
                    ? 'bg-zinc-700 font-medium text-zinc-100'
                    : o.value === ''
                    ? 'text-zinc-500 italic'
                    : 'text-zinc-100'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={triggerRef} className={className}>
      <button
        type="button"
        onClick={open ? closePanel : openPanel}
        disabled={disabled || loading}
        className={`w-full flex items-center justify-between ${triggerClass} border border-zinc-700 rounded-md px-3 py-2 text-sm text-left disabled:opacity-50 hover:border-zinc-500 transition-colors`}
      >
        <span className={selectedLabel ? 'text-zinc-100' : 'text-zinc-500'}>
          {loading
            ? (placeholder || '…')
            : (selectedLabel || placeholder || '—')}
        </span>
        <span className="ml-2 text-zinc-500 text-xs shrink-0">▾</span>
      </button>
      {panel}
    </div>
  );
}
