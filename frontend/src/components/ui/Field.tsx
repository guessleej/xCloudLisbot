import React from 'react';

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + helper/error text, consistent spacing. */
const Field: React.FC<FieldProps> = ({ label, htmlFor, helper, error, required, className = '', children }) => (
  <div className={className}>
    {label && (
      <label htmlFor={htmlFor} className="block mb-1.5 text-sm font-medium text-stone-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
    )}
    {children}
    {error ? (
      <p className="mt-1.5 text-xs text-red-600">{error}</p>
    ) : helper ? (
      <p className="mt-1.5 text-xs text-stone-400">{helper}</p>
    ) : null}
  </div>
);

export default Field;
