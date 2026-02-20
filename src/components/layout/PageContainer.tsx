import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageContainer({ children, title, actions, className = '' }: PageContainerProps) {
  return (
    <div className={`flex-1 w-full min-h-screen pb-24 lg:pb-0 relative z-[1] ${className}`}>
      {(title || actions) && (
        <div className="hidden lg:flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-panel)]">
          {title && <h1 className="text-lg font-semibold text-text-bright">{title}</h1>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-3 lg:p-4">
        {children}
      </div>
    </div>
  );
}
