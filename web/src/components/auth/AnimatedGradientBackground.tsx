import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export interface AnimatedGradientBackgroundProps {
  startingGap?: number;
  breathing?: boolean;
  gradientColors?: string[];
  gradientStops?: number[];
  animationSpeed?: number;
  breathingRange?: number;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  topOffset?: number;
  showGrid?: boolean;
  variant?: 'cyber' | 'celadon-blue' | 'sunset' | 'emerald' | 'tactical-light';
}

export const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 120,
  breathing = true,
  variant = 'tactical-light',
  gradientColors,
  gradientStops = [20, 45, 65, 80, 92, 100],
  animationSpeed = 0.04,
  breathingRange = 10,
  containerStyle = {},
  containerClassName = '',
  topOffset = 0,
  showGrid = true,
}) => {
  const getVariantColors = (v: 'cyber' | 'celadon-blue' | 'sunset' | 'emerald' | 'tactical-light') => {
    switch (v) {
      case 'tactical-light':
        return ['#e0f2fe', '#f0fdfa', '#f1f5f9', '#e2e8f0', '#f8fafc', '#ffffff'];
      case 'cyber':
        return ['#0d1b3e', '#1e1b4b', '#0e2a47', '#1a103c', '#0b1329', '#060913'];
      case 'sunset':
        return ['#3b181a', '#4a1d17', '#2e1215', '#241014', '#1a0c10', '#0f0609'];
      case 'emerald':
        return ['#0e3022', '#143d2c', '#0c2419', '#081c13', '#05140d', '#030a07'];
      case 'celadon-blue':
      default:
        return ['#1c384d', '#2d5678', '#163346', '#122a3b', '#0f202e', '#08141f'];
    }
  };

  const activeGradientColors = gradientColors || getVariantColors(variant);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationFrame: number;
    let width = startingGap;
    let directionWidth = 1;

    const animateGradient = () => {
      if (width >= startingGap + breathingRange) directionWidth = -1;
      if (width <= startingGap - breathingRange) directionWidth = 1;

      if (!breathing) directionWidth = 0;
      width += directionWidth * animationSpeed;

      const gradientStopsString = gradientStops
        .map((stop, index) => `${activeGradientColors[index] || '#050811'} ${stop}%`)
        .join(', ');

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at 50% 25%, ${gradientStopsString})`;

      if (containerRef.current) {
        containerRef.current.style.background = gradient;
      }

      animationFrame = requestAnimationFrame(animateGradient);
    };

    animationFrame = requestAnimationFrame(animateGradient);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [startingGap, breathing, activeGradientColors, gradientStops, animationSpeed, breathingRange, topOffset]);

  return (
    <motion.div
      data-testid="animated-gradient-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${containerClassName}`}
    >
      {/* Animated radial gradient container */}
      <div
        ref={containerRef}
        style={containerStyle}
        className="absolute inset-0 transition-transform"
      />

      {/* Subtle tech dot-grid pattern overlay */}
      {showGrid && (
        <div
          data-testid="tech-grid"
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              variant === 'tactical-light'
                ? 'radial-gradient(rgba(0, 104, 122, 0.20) 1px, transparent 1px)'
                : 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      )}

      {/* Ambient glowing orbs for depth */}
      {variant === 'tactical-light' ? (
        <>
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#00687a]/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-[#06b6d4]/10 blur-3xl pointer-events-none" />
        </>
      ) : variant === 'celadon-blue' ? (
        <>
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#5fa3b0]/24 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-[#2d5678]/30 blur-3xl pointer-events-none" />
          <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full bg-[#475061]/25 blur-3xl pointer-events-none" />
        </>
      ) : variant === 'sunset' ? (
        <>
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#ea580c]/24 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-[#f59e0b]/25 blur-3xl pointer-events-none" />
          <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full bg-[#b91c1c]/20 blur-3xl pointer-events-none" />
        </>
      ) : variant === 'emerald' ? (
        <>
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#10b981]/25 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-[#84cc16]/22 blur-3xl pointer-events-none" />
          <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full bg-[#059669]/20 blur-3xl pointer-events-none" />
        </>
      ) : (
        <>
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
          <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />
        </>
      )}
    </motion.div>
  );
};

export default AnimatedGradientBackground;
