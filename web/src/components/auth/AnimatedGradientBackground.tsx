import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

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
}

export const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 120,
  breathing = true,
  gradientColors = [
    '#0d1b3e',
    '#1e1b4b',
    '#0e2a47',
    '#1a103c',
    '#0b1329',
    '#060913',
  ],
  gradientStops = [20, 45, 65, 80, 92, 100],
  animationSpeed = 0.04,
  breathingRange = 10,
  containerStyle = {},
  containerClassName = '',
  topOffset = 0,
  showGrid = true,
}) => {
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
        .map((stop, index) => `${gradientColors[index] || '#050811'} ${stop}%`)
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
  }, [startingGap, breathing, gradientColors, gradientStops, animationSpeed, breathingRange, topOffset]);

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
              'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      )}

      {/* Ambient glowing orbs for depth */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 translate-x-1/4 translate-y-1/4 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />
    </motion.div>
  );
};

export default AnimatedGradientBackground;
