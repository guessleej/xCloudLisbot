import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLS: Record<Variant, string> = {
  primary:   'bg-stone-900 text-white hover:bg-stone-800 border border-stone-900 disabled:bg-stone-300 disabled:border-stone-300',
  secondary: 'bg-white text-stone-900 hover:bg-stone-50 border border-stone-300 disabled:bg-stone-50 disabled:text-stone-400',
  ghost:     'bg-transparent text-stone-700 hover:bg-stone-100 border border-transparent disabled:text-stone-300',
  danger:    'bg-white text-red-700 hover:bg-red-50 border border-red-200 disabled:text-red-300',
};

const SIZE_CLS: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', leftIcon, rightIcon, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
