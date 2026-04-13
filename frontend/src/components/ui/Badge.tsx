import React from 'react';

type Tone = 'neutral' | 'teal' | 'red' | 'amber' | 'green';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const TONE_CLS: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700 border border-stone-200',
  teal:    'bg-teal-50 text-teal-700 border border-teal-100',
  red:     'bg-red-50 text-red-700 border border-red-100',
  amber:   'bg-amber-50 text-amber-700 border border-amber-100',
  green:   'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children, ...props }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ${TONE_CLS[tone]} ${className}`}
    {...props}
  >
    {children}
  </span>
);

export default Badge;
