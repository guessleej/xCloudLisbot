import React from 'react';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'error';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children?: React.ReactNode;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-600',
  accent: 'bg-teal-50 text-teal-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
};

const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children, ...rest }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TONES[tone]} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
