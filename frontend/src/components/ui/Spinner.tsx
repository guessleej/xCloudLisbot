import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: number;
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 18, className = 'text-stone-400' }) => (
  <Loader2 size={size} strokeWidth={1.75} className={`animate-spin ${className}`} />
);

export default Spinner;
