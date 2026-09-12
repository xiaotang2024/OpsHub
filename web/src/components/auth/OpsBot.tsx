import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export interface OpsBotProps {
  isPasswordFocused?: boolean;
  showPassword?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  hasError?: boolean;
}

export const OpsBot: React.FC<OpsBotProps> = ({
  isPasswordFocused = false,
  showPassword = false,
  isLoading = false,
  isSuccess = false,
  hasError = false,
}) => {
  const botRef = useRef<HTMLDivElement | null>(null);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

  // Track mouse position to make eyes follow the cursor
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPasswordFocused || isLoading || isSuccess || !botRef.current) return;

      const rect = botRef.current.getBoundingClientRect();
      const botCenterX = rect.left + rect.width / 2;
      const botCenterY = rect.top + rect.height / 2;

      const deltaX = e.clientX - botCenterX;
      const deltaY = e.clientY - botCenterY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance === 0) return;

      // Max eye pupil shift is 5 pixels
      const maxShift = 4.5;
      const shiftX = Math.min(Math.max((deltaX / distance) * maxShift, -maxShift), maxShift);
      const shiftY = Math.min(Math.max((deltaY / distance) * maxShift, -maxShift), maxShift);

      setEyeOffset({ x: shiftX, y: shiftY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isPasswordFocused, isLoading, isSuccess]);

  // Determine eye expression
  const renderEyes = () => {
    if (isSuccess) {
      // Happy heart / joyful eyes
      return (
        <div className="flex items-center justify-center gap-4 text-rose-400 font-bold text-xs select-none">
          <span className="scale-125 animate-pulse">♥</span>
          <span className="scale-125 animate-pulse">♥</span>
        </div>
      );
    }

    if (hasError) {
      // Dizzy / shocked eyes
      return (
        <div className="flex items-center justify-center gap-3.5 text-amber-400 font-mono font-bold text-xs select-none">
          <span>&gt;</span>
          <span>&lt;</span>
        </div>
      );
    }

    if (isLoading) {
      // Loading scanning eyes
      return (
        <div className="flex items-center justify-center gap-2">
          <motion.div
            animate={{ scaleY: [1, 0.2, 1] }}
            transition={{ repeat: Infinity, duration: 0.6, ease: 'easeInOut' }}
            className="h-2 w-2 rounded-full bg-ops-cyan shadow-[0_0_8px_#06B6D4]"
          />
          <motion.div
            animate={{ scaleY: [1, 0.2, 1] }}
            transition={{ repeat: Infinity, duration: 0.6, ease: 'easeInOut', delay: 0.2 }}
            className="h-2 w-2 rounded-full bg-ops-cyan shadow-[0_0_8px_#06B6D4]"
          />
        </div>
      );
    }

    // Normal tracking eyes
    return (
      <div className="flex items-center justify-center gap-4">
        {/* Left Eye */}
        <div className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-950/80 border border-ops-cyan/30">
          <motion.div
            animate={{ x: eyeOffset.x, y: eyeOffset.y }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="h-2 w-2 rounded-full bg-ops-cyan shadow-[0_0_6px_#06B6D4]"
          />
        </div>

        {/* Right Eye */}
        <div className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-950/80 border border-ops-cyan/30">
          <motion.div
            animate={{ x: eyeOffset.x, y: eyeOffset.y }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="h-2 w-2 rounded-full bg-ops-cyan shadow-[0_0_6px_#06B6D4]"
          />
        </div>
      </div>
    );
  };

  return (
    <div
      ref={botRef}
      className="relative flex flex-col items-center justify-center select-none pointer-events-none"
    >
      {/* Little Floating Heart or Sweat Drop Bubble */}
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.5 }}
          animate={{ opacity: 1, y: -16, scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
          className="absolute -top-6 text-sm"
        >
          💖
        </motion.div>
      )}

      {hasError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, y: [-2, 2, -2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute -top-5 right-6 text-xs"
        >
          💧
        </motion.div>
      )}

      {/* Head Container */}
      <motion.div
        animate={
          isSuccess
            ? { y: [0, -8, 0] }
            : hasError
            ? { x: [-3, 3, -2, 2, 0] }
            : { y: [0, -2, 0] }
        }
        transition={
          isSuccess
            ? { duration: 0.5, repeat: 3 }
            : hasError
            ? { duration: 0.4 }
            : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
        className="relative flex flex-col items-center"
      >
        {/* Antenna */}
        <div className="flex flex-col items-center">
          <div
            className={`h-2.5 w-2.5 rounded-full border border-cyan-400/50 transition-colors ${
              isLoading
                ? 'bg-amber-400 animate-ping'
                : isSuccess
                ? 'bg-rose-400 shadow-[0_0_8px_#f43f5e]'
                : hasError
                ? 'bg-amber-400'
                : 'bg-ops-cyan shadow-cyan-glow'
            }`}
          />
          <div className="h-2 w-0.5 bg-slate-600" />
        </div>

        {/* Head Shell */}
        <div className="relative flex h-14 w-24 items-center justify-center rounded-2xl border-2 border-ops-cyan/50 bg-gradient-to-b from-slate-900 to-slate-950 p-2 shadow-[0_4px_20px_rgba(6,182,212,0.25)]">
          {/* Ear Bolts */}
          <div className="absolute -left-1.5 h-3.5 w-1.5 rounded-l-md bg-slate-700 border-l border-ops-cyan/40" />
          <div className="absolute -right-1.5 h-3.5 w-1.5 rounded-r-md bg-slate-700 border-r border-ops-cyan/40" />

          {/* Visor Screen */}
          <div className="relative flex h-9 w-full items-center justify-center rounded-xl bg-black/90 border border-ops-border overflow-hidden px-2 shadow-inner">
            {/* Blushing Cheeks when covering eyes or success */}
            {(isPasswordFocused || isSuccess) && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  className="absolute left-1.5 bottom-1 h-1.5 w-2.5 rounded-full bg-rose-500/70 blur-[1px]"
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  className="absolute right-1.5 bottom-1 h-1.5 w-2.5 rounded-full bg-rose-500/70 blur-[1px]"
                />
              </>
            )}

            {/* Eyes */}
            {renderEyes()}
          </div>

          {/* Cute Mechanical Hands for Covering Eyes ("See No Evil") */}
          <motion.div
            initial={false}
            animate={
              isPasswordFocused
                ? showPassword
                  ? { y: 2, rotate: -25, x: 2 } // Peek slightly open
                  : { y: -10, rotate: 15, x: 10 } // Full cover left eye
                : { y: 16, rotate: 0, x: 0 } // Hands resting down
            }
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="absolute -left-1 z-20 h-4 w-5 rounded-full border border-ops-cyan/60 bg-gradient-to-br from-slate-700 to-slate-900 shadow-md"
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-ops-cyan/60" />
            </div>
          </motion.div>

          <motion.div
            initial={false}
            animate={
              isPasswordFocused
                ? showPassword
                  ? { y: 2, rotate: 25, x: -2 } // Peek slightly open
                  : { y: -10, rotate: -15, x: -10 } // Full cover right eye
                : { y: 16, rotate: 0, x: 0 } // Hands resting down
            }
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="absolute -right-1 z-20 h-4 w-5 rounded-full border border-ops-cyan/60 bg-gradient-to-br from-slate-700 to-slate-900 shadow-md"
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-ops-cyan/60" />
            </div>
          </motion.div>
        </div>

        {/* Neck connector */}
        <div className="h-1 w-6 bg-slate-800 border-x border-ops-border" />
      </motion.div>
    </div>
  );
};

export default OpsBot;
