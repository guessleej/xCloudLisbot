import React from 'react';

export interface SkeletonProps {
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md bg-stone-200/70 ${className}`} />
);

export default Skeleton;
