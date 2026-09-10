import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text, icon, loading = false, className, disabled, children, ...props }, ref) => {
  const displayText = text || (typeof children === 'string' ? children : '确认提交');

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'group relative w-full cursor-pointer overflow-hidden rounded-xl border border-ops-border bg-ops-surface px-6 py-2.5 text-center text-sm font-medium text-white transition-all duration-300 shadow-md hover:border-ops-cyan/60 hover:shadow-lg hover:shadow-ops-cyan/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2 transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
        {loading && (
          <span
            data-testid="button-spinner"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          />
        )}
        {children || displayText}
      </span>
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold opacity-0 transition-all duration-300 group-hover:opacity-100">
        <span>{children || displayText}</span>
        {icon || <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
      </div>
    </button>
  );
});

InteractiveHoverButton.displayName = 'InteractiveHoverButton';

export default InteractiveHoverButton;
