import React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', ...rest }, ref) => (
  <input
    ref={ref}
    className={`w-full h-9 px-3 text-sm text-stone-900 bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors disabled:bg-stone-50 disabled:text-stone-400 ${className}`}
    {...rest}
  />
));

Input.displayName = 'Input';
export default Input;
