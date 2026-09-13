import React from 'react';

export interface OpsHubLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showGlow?: boolean;
  showLiveBadge?: boolean;
  alt?: string;
}

export const OpsHubLogo: React.FC<OpsHubLogoProps> = ({
  size = 'md',
  className = '',
  showGlow = true,
  showLiveBadge = false,
  alt = 'OpsHub Logo',
}) => {
  const sizeMap: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
    xs: 'h-5 w-5',
    sm: 'h-6 w-6',
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
    xl: 'h-16 w-16',
  };

  const dimensionClass = typeof size === 'number' ? '' : sizeMap[size];
  const customStyle = typeof size === 'number' ? { width: size, height: size } : undefined;

  return (
    <div
      data-testid="opshub-logo"
      style={customStyle}
      className={`relative inline-flex shrink-0 items-center justify-center select-none ${dimensionClass} ${className}`}
    >
      <img
        src="/logo.png"
        alt={alt}
        className={`h-full w-full object-contain rounded-lg transition-transform duration-300 hover:scale-105 ${
          showGlow ? 'drop-shadow-[0_0_12px_rgba(6,182,212,0.45)]' : ''
        }`}
      />
      {showLiveBadge && (
        <>
          <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-ops-emerald animate-ping" />
          <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-ops-emerald" />
        </>
      )}
    </div>
  );
};

export default OpsHubLogo;
