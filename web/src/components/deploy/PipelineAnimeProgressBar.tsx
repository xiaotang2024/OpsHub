import React, { useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Clock, Heart, Zap, AlertTriangle, PartyPopper } from 'lucide-react';

export interface PipelineAnimeProgressBarProps {
  activeStep: number;
  totalSteps?: number;
  running: boolean;
  finished: boolean;
  error?: string | null;
  elapsedSeconds?: number;
  serviceName?: string;
}

const STEP_DIALOGUES: Record<number, { title: string; quote: string; emoji: string }> = {
  1: {
    title: '阶段一 · 全维预检',
    quote: '喵！正在仔细检查宿主机环境与端口权限，一切安全喵~ 🐾',
    emoji: '🔍',
  },
  2: {
    title: '阶段二 · 就地备份',
    quote: '给现有运行包拍个快照稳妥备份中，安心拉满！✨',
    emoji: '📦',
  },
  3: {
    title: '阶段三 · 优雅停机',
    quote: '旧版本实例辛苦啦，正在温柔闭门休眠 Zzz... 🌙',
    emoji: '💤',
  },
  4: {
    title: '阶段四 · 制品分发',
    quote: '制品包打包完毕，咻咻咻飞奔前往目标安装目录！💨',
    emoji: '🚚',
  },
  5: {
    title: '阶段五 · 点火启动',
    quote: '注入全新配置能量，发动机点火新版本起飞咯~ 🚀',
    emoji: '🔥',
  },
  6: {
    title: '阶段六 · 就绪探针',
    quote: '探针咚咚咚敲门：服务服务你健康吗？心跳扑通扑通~ 🩺',
    emoji: '💓',
  },
  7: {
    title: '阶段七 · 审计生效',
    quote: '太棒啦！7 步大功告成！新版本闪耀登场，发版大吉~ 🌈',
    emoji: '🎉',
  },
};

const ERROR_DIALOGUE = {
  title: '异常中断 · 守护回退',
  quote: '呜喵~ 探针检测到异常，已启动零停机自愈保护机制喵... 😿',
  emoji: '💔',
};

export const PipelineAnimeProgressBar: React.FC<PipelineAnimeProgressBarProps> = ({
  activeStep = 1,
  totalSteps = 7,
  running,
  finished,
  error,
  elapsedSeconds = 0,
}) => {
  // Compute percentage (1 to 7)
  const percent = useMemo(() => {
    if (finished) return 100;
    if (error) return Math.min(100, Math.round((activeStep / totalSteps) * 100));
    if (activeStep <= 1) return 14;
    if (activeStep === 2) return 28;
    if (activeStep === 3) return 42;
    if (activeStep === 4) return 57;
    if (activeStep === 5) return 71;
    if (activeStep === 6) return 85;
    return 95;
  }, [activeStep, totalSteps, finished, error]);

  const currentDialogue = useMemo(() => {
    if (error) return ERROR_DIALOGUE;
    return STEP_DIALOGUES[activeStep] || STEP_DIALOGUES[1];
  }, [activeStep, error]);

  const isFailed = Boolean(error);

  const speechBubbleRef = useRef<HTMLDivElement>(null);
  const percentBadgeRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (speechBubbleRef.current) {
      gsap.fromTo(
        speechBubbleRef.current,
        { scale: 0.94, opacity: 0.85 },
        { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.7)', clearProps: 'transform,opacity' }
      );
    }
  }, { dependencies: [activeStep, error], revertOnUpdate: true });

  useGSAP(() => {
    if (percentBadgeRef.current) {
      gsap.fromTo(
        percentBadgeRef.current,
        { scale: 1.18 },
        { scale: 1, duration: 0.3, ease: 'power2.out', clearProps: 'transform' }
      );
    }
  }, { dependencies: [percent], revertOnUpdate: true });

  return (
    <motion.div
      data-testid="pipeline-anime-progress-bar"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border border-ops-border/80 bg-gradient-to-b from-[#0e1628]/95 via-[#090f1d]/95 to-[#060a14]/95 p-3 sm:p-3.5 shadow-lg backdrop-blur-md space-y-2.5 select-none"
    >
      {/* Anime Background Glow & Floating Sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Ambient colored lighting */}
        <div
          className={`absolute -top-8 left-1/4 h-20 w-48 rounded-full blur-2xl opacity-25 transition-colors duration-500 ${
            isFailed
              ? 'bg-rose-500'
              : finished
              ? 'bg-emerald-400'
              : 'bg-gradient-to-r from-pink-500 via-cyan-400 to-purple-500'
          }`}
        />

        {/* Floating Stars & Hearts */}
        {running && (
          <>
            <motion.div
              animate={{ y: [-3, 3, -3], opacity: [0.3, 0.9, 0.3], rotate: [0, 20, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              className="absolute top-1.5 left-4 text-pink-400 text-[10px]"
            >
              ✦
            </motion.div>
            <motion.div
              animate={{ y: [3, -3, 3], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.3 }}
              className="absolute top-1.5 right-6 text-amber-300 text-[10px]"
            >
              <Sparkles className="h-3.5 w-3.5 fill-amber-300/40 text-amber-300" />
            </motion.div>
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.8, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', delay: 0.5 }}
              className="absolute bottom-1 left-8 text-cyan-400 text-[10px]"
            >
              ★
            </motion.div>
            <motion.div
              animate={{ y: [-2, 2, -2], opacity: [0.3, 0.9, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.3, ease: 'easeInOut', delay: 0.2 }}
              className="absolute bottom-1 right-12 text-emerald-400 text-[10px] font-mono"
            >
              ⚡
            </motion.div>
          </>
        )}

        {finished && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
            transition={{ duration: 0.5 }}
            className="absolute top-1.5 right-5 text-pink-400"
          >
            <Heart className="h-4 w-4 fill-pink-500/60 text-pink-400 animate-pulse" />
          </motion.div>
        )}
      </div>

      {/* Top Bar: Mascot Dialogue Speech Bubble + Percent Badge */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        {/* Cute Speech Bubble from Ops-Chan */}
        <div
          ref={speechBubbleRef}
          data-testid="anime-speech-bubble"
          className="flex items-center gap-2 rounded-lg border border-ops-border/80 bg-slate-900/90 px-2.5 py-1.5 shadow-md backdrop-blur-sm max-w-full"
        >
          <span className="text-base shrink-0" role="img" aria-label="emoji">
            {currentDialogue.emoji}
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-extrabold tracking-wide ${
                  isFailed
                    ? 'text-rose-400'
                    : finished
                    ? 'text-emerald-400'
                    : 'text-ops-cyan'
                }`}
              >
                {currentDialogue.title}
              </span>
              <span className="hidden sm:inline-block rounded-full bg-ops-border/60 px-1.5 py-0.2 text-[9px] font-mono text-ops-text-muted">
                Step {activeStep}/{totalSteps}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate font-sans leading-tight">
              {currentDialogue.quote}
            </p>
          </div>
        </div>

        {/* Right Info: Cute Percent Pill & Elapsed Seconds */}
        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          {/* Animated Mascot Badge */}
          <div
            ref={percentBadgeRef}
            data-testid="anime-percent-badge"
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-black shadow-md transition-colors ${
              isFailed
                ? 'border border-rose-500/50 bg-rose-950/60 text-rose-300'
                : finished
                ? 'border border-emerald-400/50 bg-emerald-950/60 text-emerald-300 shadow-emerald-500/20'
                : 'border border-cyan-400/50 bg-cyan-950/60 text-cyan-300 shadow-cyan-500/20'
            }`}
          >
            {finished ? (
              <PartyPopper className="h-3 w-3 text-amber-300 animate-bounce" />
            ) : isFailed ? (
              <AlertTriangle className="h-3 w-3 text-rose-400" />
            ) : (
              <Zap className="h-3 w-3 fill-cyan-400 text-cyan-400 animate-pulse" />
            )}
            <span>{percent}%</span>
          </div>

          {/* Clock Timer */}
          <div className="inline-flex items-center gap-1 rounded-full border border-ops-border bg-slate-900/80 px-2 py-0.5 text-xs font-mono text-ops-text-muted">
            <Clock className="h-3 w-3 text-ops-text-muted" />
            <span>{elapsedSeconds}s</span>
          </div>
        </div>
      </div>

      {/* Progress Track Area with Running Chibi Mascot */}
      <div className="relative pt-5 pb-1">
        {/* Running Anime Cat Mascot Avatar (Slides along the progress bar!) */}
        <div
          className="absolute top-0 z-20 pointer-events-none transition-all duration-500 ease-out"
          style={{
            left: `clamp(14px, ${percent}%, calc(100% - 16px))`,
            transform: 'translateX(-50%)',
          }}
        >
          <motion.div
            data-testid="anime-mascot-runner"
            animate={
              isFailed
                ? { rotate: [-4, 4, -4] }
                : finished
                ? { y: [0, -6, 0], rotate: [-2, 2, -2] }
                : { y: [0, -3, 0], rotate: [-3, 3, -3] }
            }
            transition={{
              repeat: Infinity,
              duration: finished ? 0.6 : 0.45,
              ease: 'easeInOut',
            }}
            className="relative flex flex-col items-center"
          >
            {/* Cute Cat Mascot SVG */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-[0_2px_6px_rgba(6,182,212,0.4)]"
            >
              {/* Rocket Thruster Flame (behind cat) */}
              {running && (
                <motion.path
                  animate={{ scaleY: [0.8, 1.3, 0.8], opacity: [0.7, 1, 0.7] }}
                  transition={{ repeat: Infinity, duration: 0.2 }}
                  d="M16 68 L22 84 L28 68 Z"
                  fill="#F59E0B"
                />
              )}

              {/* Cat Ears */}
              <g>
                <path
                  d="M26 36 L36 14 L46 30 Z"
                  fill="#1E293B"
                  stroke={isFailed ? '#F43F5E' : finished ? '#10B981' : '#38BDF8'}
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                />
                <path d="M30 33 L36 20 L42 29 Z" fill="#F472B6" />

                <path
                  d="M74 36 L64 14 L54 30 Z"
                  fill="#1E293B"
                  stroke={isFailed ? '#F43F5E' : finished ? '#10B981' : '#38BDF8'}
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                />
                <path d="M70 33 L64 20 L58 29 Z" fill="#F472B6" />
              </g>

              {/* Head Shell */}
              <rect
                x="20"
                y="26"
                width="60"
                height="50"
                rx="22"
                fill="#0F172A"
                stroke={isFailed ? '#F43F5E' : finished ? '#10B981' : '#38BDF8'}
                strokeWidth="4"
              />

              {/* Visor / Face Screen */}
              <rect
                x="28"
                y="36"
                width="44"
                height="30"
                rx="12"
                fill="#020617"
              />

              {/* Cheeks blush */}
              <ellipse cx="34" cy="56" rx="4" ry="2" fill="#F472B6" opacity="0.85" />
              <ellipse cx="66" cy="56" rx="4" ry="2" fill="#F472B6" opacity="0.85" />

              {/* Cute Eyes by State */}
              {isFailed ? (
                // Crying / dizzy eyes (> <)
                <g stroke="#F43F5E" strokeWidth="3" strokeLinecap="round">
                  <path d="M34 46 L42 50 L34 54" />
                  <path d="M66 46 L58 50 L66 54" />
                  <circle cx="30" cy="52" r="2" fill="#38BDF8" />
                  <circle cx="70" cy="52" r="2" fill="#38BDF8" />
                </g>
              ) : finished ? (
                // Joyful eyes (^ ^)
                <g stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" fill="none">
                  <path d="M34 50 Q40 43 46 50" />
                  <path d="M54 50 Q60 43 66 50" />
                  <path d="M47 57 Q50 60 53 57" stroke="#F472B6" strokeWidth="2.5" />
                </g>
              ) : (
                // Sparkling running anime eyes
                <g>
                  <circle cx="40" cy="48" r="5" fill="#38BDF8" />
                  <circle cx="42" cy="46" r="2" fill="#FFFFFF" />
                  <circle cx="60" cy="48" r="5" fill="#38BDF8" />
                  <circle cx="62" cy="46" r="2" fill="#FFFFFF" />
                  <path d="M48 56 Q50 58 52 56" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
                </g>
              )}

              {/* Running paws */}
              <circle cx="35" cy="77" r="5" fill="#1E293B" stroke={isFailed ? '#F43F5E' : finished ? '#10B981' : '#38BDF8'} strokeWidth="2.5" />
              <circle cx="65" cy="77" r="5" fill="#1E293B" stroke={isFailed ? '#F43F5E' : finished ? '#10B981' : '#38BDF8'} strokeWidth="2.5" />
            </svg>

            {/* Trailing speed lines / smoke dust puff */}
            {running && (
              <motion.div
                animate={{ x: [-1, -5, -1], opacity: [0.2, 0.8, 0.2] }}
                transition={{ repeat: Infinity, duration: 0.35 }}
                className="absolute -bottom-0.5 -left-1.5 text-[8px] text-cyan-300 font-bold"
              >
                💨
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Anime Track Container */}
        <div
          data-testid="anime-progress-track"
          className="relative h-3.5 sm:h-4 w-full rounded-full bg-slate-950/90 border border-dashed border-ops-border/80 p-0.5 shadow-inner overflow-hidden"
        >
          {/* Animated Diagonal Candy Stripes Pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, #FFF 0, #FFF 10px, transparent 10px, transparent 20px)',
            }}
          />

          {/* Animated Fill Bar */}
          <motion.div
            data-testid="anime-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ type: 'spring', stiffness: 70, damping: 14 }}
            className={`relative h-full rounded-full transition-colors duration-500 ${
              isFailed
                ? 'bg-gradient-to-r from-rose-500 via-red-500 to-pink-600 shadow-[0_0_15px_rgba(244,63,94,0.6)]'
                : finished
                ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_18px_rgba(16,185,129,0.7)]'
                : 'bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.7)]'
            }`}
          >
            {/* Glossy highlight line */}
            <div className="absolute top-0 inset-x-0 h-1/2 rounded-t-full bg-white/30" />

            {/* Leading Sparkle Head */}
            {running && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_#FFF] animate-ping opacity-80" />
            )}
          </motion.div>
        </div>

        {/* 7-Step Landmark Stars / Checkpoint Flags */}
        <div className="mt-1 flex justify-between px-1">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((stepNum) => {
            const isPassed = stepNum <= activeStep;
            const isCurrent = stepNum === activeStep && !finished;

            return (
              <div key={stepNum} className="flex flex-col items-center gap-0.5">
                <span
                  className={`text-[9px] font-mono transition-colors ${
                    isCurrent
                      ? 'text-ops-cyan font-bold scale-110'
                      : isPassed
                      ? 'text-amber-300'
                      : 'text-slate-600'
                  }`}
                >
                  {isPassed ? '★' : '✦'}
                </span>
                <span
                  className={`text-[8px] font-mono ${
                    isCurrent
                      ? 'text-ops-cyan font-bold'
                      : isPassed
                      ? 'text-slate-300'
                      : 'text-slate-600'
                  }`}
                >
                  0{stepNum}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Notice Box if Failed */}
      {isFailed && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 p-2 text-xs font-mono text-rose-300 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <span className="font-bold">部署遇到阻滞：</span>
            <span className="break-all">{error}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PipelineAnimeProgressBar;
