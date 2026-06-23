import React from 'react';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', rows = 3, ...rest }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={`w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 transition-colors resize-y ${className}`}
    {...rest}
  />
));

Textarea.displayName = 'Textarea';
export default Textarea;
