import { t } from '../lib/i18n.js';
import SearchableSelect from './SearchableSelect.jsx';

/**
 * Renders the right input for one extra field, based on its Notion property
 * type. `def` is { name, type, options } from the store; the label is the
 * property's own (user-chosen) name, so it needs no translation.
 * Pass `error={true}` to highlight the field red (required field not filled).
 */
export default function ExtraFieldInput({ def, value, onChange, disabled, error }) {
  const borderClass = error ? 'border-danger' : 'border-stroke';
  const inputClass = `w-full bg-control border ${borderClass} rounded-md px-3 py-2 text-sm placeholder-fg3`;

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
            className="accent-accent"
          />
        );
      case 'select':
      case 'status':
      case 'people':
      case 'relation': {
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
            triggerClass={`bg-control ${error ? 'border-danger' : ''}`}
            className="w-full"
          />
        );
      }
      case 'multi_select':
        return (
          <div className={`flex flex-wrap gap-1 ${error ? 'rounded-md ring-1 ring-danger p-1' : ''}`}>
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
                      ? 'bg-accent border-accent text-on-accent'
                      : 'bg-control border-stroke text-fg1 hover:bg-control-hover'
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

  const labelClass = `text-xs ${error ? 'text-danger' : 'text-fg2'}`;
  // A required field is marked with *, as on Android.
  const label = def.required ? `${def.name} *` : def.name;

  if (def.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        {input()}
        <span className={labelClass}>{label}</span>
      </label>
    );
  }

  return (
    <div>
      <label className={`block mb-1 ${labelClass}`}>{label}</label>
      {input()}
    </div>
  );
}
