import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ className = '', children, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    className={`inline-flex items-center justify-center h-8 w-8 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:opacity-50 ${className}`}
    {...rest}
  >
    {children}
  </button>
));

IconButton.displayName = 'IconButton';
export default IconButton;
