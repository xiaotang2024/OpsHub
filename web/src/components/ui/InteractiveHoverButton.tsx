import React from 'react';
import { ArrowRight } from 'lucide-react';
import gsap from 'gsap';
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
>(({ text, icon, loading = false, className, disabled, children, onMouseDown, onMouseUp, onMouseLeave, ...props }, ref) => {
  const displayText = text || (typeof children === 'string' ? children : '确认提交');

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      gsap.to(e.currentTarget, { scale: 0.97, duration: 0.1, ease: 'power2.out' });
    }
    onMouseDown?.(e);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      gsap.to(e.currentTarget, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
    }
    onMouseUp?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      gsap.to(e.currentTarget, { scale: 1, duration: 0.2, ease: 'power2.out' });
    }
    onMouseLeave?.(e);
  };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
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
