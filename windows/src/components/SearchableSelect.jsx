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
 * @param {boolean}  [allowClear]  - Whether to show a "– none –" first option
 * @param {boolean}  [disabled]
 * @param {boolean}  [loading]     - Disables and shows placeholder while loading
 * @param {string}   [className]   - Applied to the outer wrapper div
 * @param {string}   [triggerClass] - Background class for the trigger button
 *                                    (default 'bg-control')
 * @param {string}   [buttonClass] - Replaces the trigger button's whole look
 *                                   (the timer's workspace title uses it)
 * @param {fn}       [renderValue] - Draws the trigger's content from the selected
 *                                   option (or undefined); replaces label and ▾
 * @param {fn}       [renderPrefix] - Draws something before each option's label
 *                                    (a workspace's colour dot)
 * @param {number}   [panelMinWidth] - Minimum width of the panel, for a trigger
 *                                     narrower than its options
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
  triggerClass = 'bg-control',
  buttonClass,
  renderValue,
  renderPrefix,
  panelMinWidth = 0,
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
        ? [{ value: '', label: placeholder || '–' }, ...options]
        : options
      : options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase())
        );

  const openPanel = () => {
    if (disabled || loading) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    const MAX_HEIGHT = 320;
    // A panel wider than its trigger is centred under it, and kept inside the window.
    const width = Math.min(Math.max(rect.width, panelMinWidth), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8));
    if (spaceBelow >= spaceAbove || spaceBelow >= 160) {
      setPanelStyle({
        top: rect.bottom + 2,
        left,
        width,
        maxHeight: Math.min(MAX_HEIGHT, spaceBelow),
      });
    } else {
      setPanelStyle({
        bottom: window.innerHeight - rect.top + 2,
        left,
        width,
        maxHeight: Math.min(MAX_HEIGHT, spaceAbove),
      });
    }
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
          className="fixed z-[9999] bg-flyout border border-surface-stroke rounded-lg shadow-flyout py-1 flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="p-1.5 border-b border-stroke shrink-0">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('placeholderSearch')}
              className="w-full bg-control border border-stroke rounded px-2 py-1.5 text-sm placeholder-fg3 outline-none"
            />
          </div>
          <div className="overflow-y-auto py-1 min-h-0">
            {displayOptions.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-fg3 italic">
                {t('searchNoResults')}
              </div>
            )}
            {displayOptions.map((o) => (
              <button
                key={o.value === '' ? '__empty__' : o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-subtle-hover flex items-center gap-2 ${
                  o.value !== '' && o.value === value
                    ? 'bg-subtle-hover font-medium text-fg1'
                    : o.value === ''
                    ? 'text-fg3 italic'
                    : 'text-fg1'
                }`}
              >
                {renderPrefix && o.value !== '' && renderPrefix(o)}
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
        className={
          buttonClass ??
          `w-full flex items-center justify-between ${triggerClass} border border-stroke rounded-md px-3 py-2 text-sm text-left disabled:opacity-50 hover:border-stroke-strong transition-colors`
        }
      >
        {renderValue ? (
          renderValue(options.find((o) => o.value === value))
        ) : (
          <>
            <span className={selectedLabel ? 'text-fg1' : 'text-fg3'}>
              {loading
                ? (placeholder || '…')
                : (selectedLabel || placeholder || '–')}
            </span>
            <span className="ml-2 text-fg3 text-xs shrink-0">▾</span>
          </>
        )}
      </button>
      {panel}
    </div>
  );
}
