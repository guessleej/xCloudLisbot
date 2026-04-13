import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full h-9 px-3 text-sm bg-white rounded-md border transition-colors placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
        error
          ? 'border-red-300 focus:border-red-500'
          : 'border-stone-300 focus:border-stone-500'
      } ${className}`}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export default Input;
