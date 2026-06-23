import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children?: React.ReactNode;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className = '', children, ...rest }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={`w-full h-9 pl-3 pr-9 text-sm text-stone-900 bg-white border border-stone-200 rounded-lg appearance-none focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors disabled:bg-stone-50 disabled:text-stone-400 ${className}`}
      {...rest}
    >
      {children}
    </select>
    <ChevronDown
      size={15}
      strokeWidth={1.75}
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
    />
  </div>
));

Select.displayName = 'Select';
export default Select;
