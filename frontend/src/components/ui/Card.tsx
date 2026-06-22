import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/** Surface card: white, hairline border, soft shadow, large radius. Pages add their own padding. */
const Card: React.FC<CardProps> = ({ className = '', children, ...rest }) => (
  <div className={`bg-white border border-stone-200 rounded-2xl shadow-card ${className}`} {...rest}>
    {children}
  </div>
);

export default Card;
