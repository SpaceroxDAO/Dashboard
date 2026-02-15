import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, error, className = '', ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-surface-elevated border border-[var(--color-border-panel)] rounded-lg
            py-2 text-text-bright placeholder:text-text-dim
            focus:outline-none focus:ring-2 focus:ring-signal-primary/50 focus:border-signal-primary
            ${icon ? 'pl-10 pr-4' : 'px-4'}
            ${error ? 'border-signal-alert focus:ring-signal-alert/50 focus:border-signal-alert' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-signal-alert">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
