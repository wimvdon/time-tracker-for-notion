import { t } from '../lib/i18n.js';
import SearchableSelect from './SearchableSelect.jsx';

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm placeholder-zinc-600';

/**
 * Renders the right input for one extra field, based on its Notion property
 * type. `def` is { name, type, options } from the store; the label is the
 * property's own (user-chosen) name, so it needs no translation.
 */
export default function ExtraFieldInput({ def, value, onChange, disabled }) {
  const input = () => {
    switch (def.type) {
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );
      case 'date':
        return (
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="accent-emerald-500"
          />
        );
      case 'select':
      case 'status':
      case 'people':
      case 'relation': {
        // select/status are stored by option name; people/relation by id
        const byId = def.type === 'people' || def.type === 'relation';
        const selectOpts = def.options.map((o) => ({
          value: byId ? o.id : o.name,
          label: o.name,
        }));
        return (
          <SearchableSelect
            value={value}
            onChange={onChange}
            options={selectOpts}
            placeholder={t('placeholderSelect')}
            disabled={disabled}
            triggerClass="bg-zinc-800"
            className="w-full"
          />
        );
      }
      case 'multi_select':
        return (
          <div className="flex flex-wrap gap-1">
            {def.options.map((o) => {
              const active = value.includes(o.name);
              return (
                <button
                  key={o.name}
                  onClick={() =>
                    onChange(active ? value.filter((n) => n !== o.name) : [...value, o.name])
                  }
                  disabled={disabled}
                  className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                    active
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-zinc-700 border-zinc-600 text-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        );
      case 'url':
      case 'files':
        return (
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            disabled={disabled}
            className={inputClass}
          />
        );
      case 'email':
        return (
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );
      case 'phone_number':
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );
      default:
        // rich_text and any future text-like type
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );
    }
  };

  // Checkbox reads better with the label beside it
  if (def.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        {input()}
        <span className="text-xs text-zinc-400">{def.name}</span>
      </label>
    );
  }

  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{def.name}</label>
      {input()}
    </div>
  );
}
