import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Canonical inline-flex switch. On = teal, off = stone. */
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled = false, ...aria }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:opacity-50 disabled:cursor-not-allowed ${
      checked ? 'bg-teal-600' : 'bg-stone-300'
    }`}
    {...aria}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

export default Toggle;
