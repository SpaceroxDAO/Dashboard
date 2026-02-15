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
      {/* Page Header */}
      {(title || actions) && (
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-panel)]">
          {title && <h1 className="text-2xl font-semibold text-text-bright">{title}</h1>}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      )}

      {/* Page Content */}
      <div className="p-4 lg:p-6">
        {children}
      </div>
    </div>
  );
}
