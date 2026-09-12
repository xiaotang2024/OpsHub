import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Zap, Heart, AlertCircle, X } from 'lucide-react';

export interface ServiceStartAnimeOverlayProps {
  serviceName: string;
  status: 'starting' | 'success' | 'error';
  errorMessage?: string;
  onClose?: () => void;
}

export const ServiceStartAnimeOverlay: React.FC<ServiceStartAnimeOverlayProps> = ({
  serviceName,
  status,
  errorMessage,
  onClose,
}) => {
  const isStarting = status === 'starting';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <motion.div
      data-testid="anime-start-overlay"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-4 rounded-xl backdrop-blur-md select-none transition-colors ${
        isSuccess
          ? 'bg-[#04121a]/92 border-2 border-emerald-400/70 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
          : isError
          ? 'bg-[#15060b]/92 border-2 border-rose-500/70 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
          : 'bg-[#050b17]/92 border-2 border-ops-cyan/70 shadow-[0_0_25px_rgba(6,182,212,0.3)]'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Optional manual close button on error */}
      {isError && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭提示"
          className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Floating Animated Particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        {isStarting && (
          <>
            <motion.div
              animate={{ y: [-4, 4, -4], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              className="absolute top-3 left-4 text-ops-cyan text-xs font-bold"
            >
              <Zap className="h-4 w-4 text-cyan-400 fill-cyan-400/50" />
            </motion.div>
            <motion.div
              animate={{ y: [4, -4, 4], opacity: [0.3, 0.9, 0.3], rotate: [0, 15, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', delay: 0.2 }}
              className="absolute top-4 right-5 text-amber-300 text-xs"
            >
              <Sparkles className="h-4 w-4 text-amber-300 fill-amber-300/60" />
            </motion.div>
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.8, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.4 }}
              className="absolute bottom-3 left-6 text-pink-400 text-xs font-mono"
            >
              ✦
            </motion.div>
            <motion.div
              animate={{ y: [-3, 3, -3], opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.3, ease: 'easeInOut', delay: 0.5 }}
              className="absolute bottom-4 right-6 text-emerald-400 text-xs font-mono"
            >
              ⚡
            </motion.div>
          </>
        )}

        {isSuccess && (
          <>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="absolute top-3 left-6 text-emerald-400 text-sm"
            >
              <Heart className="h-4 w-4 text-emerald-400 fill-emerald-400 animate-pulse" />
            </motion.div>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4, 1], opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="absolute top-3 right-6 text-pink-400 text-sm"
            >
              <Heart className="h-4 w-4 text-pink-400 fill-pink-400 animate-pulse" />
            </motion.div>
          </>
        )}
      </div>

      {/* Anime Mascot Character: "喵小智 / Ops-Chan" */}
      <motion.div
        data-testid="anime-mascot"
        animate={
          isStarting
            ? { y: [0, -6, 0], rotate: [-1.5, 1.5, -1.5] }
            : isSuccess
            ? { y: [0, -10, 0], scale: [1, 1.08, 1] }
            : { rotate: [-4, 4, -4] }
        }
        transition={{
          repeat: Infinity,
          duration: isSuccess ? 0.7 : isStarting ? 0.9 : 1.1,
          ease: 'easeInOut',
        }}
        className="relative mb-2 flex items-center justify-center"
      >
        <svg
          width="82"
          height="82"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_4px_12px_rgba(6,182,212,0.35)]"
        >
          {/* Outer Energy Halo Ring */}
          <circle
            cx="50"
            cy="52"
            r="44"
            className={
              isSuccess
                ? 'stroke-emerald-400/30'
                : isError
                ? 'stroke-rose-500/30'
                : 'stroke-cyan-400/30'
            }
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />

          {/* Cat Ears */}
          <g>
            {/* Left Ear */}
            <motion.path
              animate={isStarting ? { rotate: [-5, 5, -5] } : {}}
              transition={{ repeat: Infinity, duration: 0.6 }}
              d="M24 38 L34 16 L44 32 Z"
              fill="#1E293B"
              stroke="#06B6D4"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Left Inner Ear (Pink) */}
            <path d="M28 35 L34 22 L40 31 Z" fill="#F472B6" />

            {/* Right Ear */}
            <motion.path
              animate={isStarting ? { rotate: [5, -5, 5] } : {}}
              transition={{ repeat: Infinity, duration: 0.6 }}
              d="M76 38 L66 16 L56 32 Z"
              fill="#1E293B"
              stroke="#06B6D4"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Right Inner Ear (Pink) */}
            <path d="M72 35 L66 22 L60 31 Z" fill="#F472B6" />
          </g>

          {/* Robot Head Chassis */}
          <rect
            x="20"
            y="28"
            width="60"
            height="48"
            rx="20"
            fill="#0F172A"
            stroke={isSuccess ? '#10B981' : isError ? '#F43F5E' : '#38BDF8'}
            strokeWidth="3"
          />

          {/* Head Visor / Face Screen */}
          <rect
            x="26"
            y="35"
            width="48"
            height="34"
            rx="14"
            fill="#050914"
            stroke="#1E293B"
            strokeWidth="1.5"
          />

          {/* Cheerful Blushing Cheeks (Pink glow) */}
          <circle cx="33" cy="56" r="3.5" fill="#FB7185" opacity="0.8" />
          <circle cx="67" cy="56" r="3.5" fill="#FB7185" opacity="0.8" />

          {/* Anime Eyes Expressions */}
          {isStarting && (
            <g>
              {/* Happy squinting blinking eyes (> <) or round shine eyes */}
              <motion.path
                animate={{ scaleY: [1, 0.15, 1] }}
                transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.25 }}
                d="M32 46 C35 43, 39 43, 42 46"
                stroke="#38BDF8"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <motion.path
                animate={{ scaleY: [1, 0.15, 1] }}
                transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.25 }}
                d="M58 46 C61 43, 65 43, 68 46"
                stroke="#38BDF8"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              {/* Cute cat mouth (w) */}
              <path
                d="M46 54 Q48 57 50 54 Q52 57 54 54"
                stroke="#38BDF8"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          )}

          {isSuccess && (
            <g>
              {/* Joyful Star / Heart Eyes */}
              <circle cx="37" cy="46" r="4" fill="#34D399" />
              <circle cx="38" cy="44" r="1.5" fill="#FFFFFF" />
              <circle cx="63" cy="46" r="4" fill="#34D399" />
              <circle cx="64" cy="44" r="1.5" fill="#FFFFFF" />
              {/* Happy open laughing mouth (D) */}
              <path
                d="M45 53 Q50 60 55 53 Z"
                fill="#FB7185"
                stroke="#34D399"
                strokeWidth="1.5"
              />
            </g>
          )}

          {isError && (
            <g>
              {/* Dizzy / Sad Eyes (x x or T T) */}
              <path
                d="M33 43 L41 51 M41 43 L33 51"
                stroke="#FB7185"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M59 43 L67 51 M67 43 L59 51"
                stroke="#FB7185"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Wavy mouth (~) */}
              <path
                d="M45 56 Q47 53 50 56 Q53 59 55 56"
                stroke="#FB7185"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
              {/* Sweat drop on forehead */}
              <path
                d="M72 32 C70 34, 70 38, 73 38 C75 38, 75 34, 72 32 Z"
                fill="#38BDF8"
              />
            </g>
          )}

          {/* Cute Little Paws (Holding Chassis) */}
          <circle cx="34" cy="74" r="5" fill="#1E293B" stroke="#06B6D4" strokeWidth="2" />
          <circle cx="66" cy="74" r="5" fill="#1E293B" stroke="#06B6D4" strokeWidth="2" />
        </svg>
      </motion.div>

      {/* Service Name Pill */}
      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-[11px] font-mono text-ops-cyan font-bold tracking-tight mb-1.5">
        <span className="max-w-[160px] truncate">{serviceName}</span>
      </div>

      {/* Main Cheerful Narrative Text */}
      <div className="text-center space-y-0.5 max-w-[220px]">
        {isStarting && (
          <>
            <p className="text-xs font-bold text-white tracking-wide">
              动力注入中！٩(๑&gt;◡&lt;๑)۶
            </p>
            <p className="text-[11px] text-cyan-300/80 font-medium">
              引擎预热点火～冲鸭！⚡️
            </p>
          </>
        )}

        {isSuccess && (
          <>
            <p className="text-xs font-bold text-emerald-300 tracking-wide">
              服务启动大成功！✧(≖ ◡ ≖✿)
            </p>
            <p className="text-[11px] text-emerald-400/80 font-medium">
              已满血进入就绪状态喵～✨
            </p>
          </>
        )}

        {isError && (
          <>
            <p className="text-xs font-bold text-rose-400 tracking-wide">
              呜哇，启动好像跌倒了 QAQ
            </p>
            <p className="text-[10px] text-rose-300/80 font-mono truncate" title={errorMessage}>
              {errorMessage || '启动遇到未知异常'}
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ServiceStartAnimeOverlay;
