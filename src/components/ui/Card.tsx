import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  accentColor?: string;
}

export function Card({ children, padding = 'md', hover = false, accentColor, className = '', ...props }: CardProps) {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={`
        bg-surface-elevated rounded-xl relative panel-glow
        ${hover ? 'hover:bg-surface-hover cursor-pointer' : ''}
        ${paddings[padding]}
        ${className}
      `}
      style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
