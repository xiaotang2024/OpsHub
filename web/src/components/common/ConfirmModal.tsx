import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, Trash2, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title = '操作确认',
  subtitle = '高危操作 · 请谨慎核对',
  message,
  confirmText = '确认执行',
  cancelText = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const modalContent = (
    <AnimatePresence>
      {visible && (
        <div
          data-testid="confirm-modal-backdrop"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md"
        onClick={() => {
          if (!loading) onCancel();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          data-testid="confirm-modal"
          className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
            isDanger
              ? 'border-red-500/30 bg-ops-surface shadow-[0_0_50px_rgba(239,68,68,0.15)]'
              : isWarning
              ? 'border-amber-500/30 bg-ops-surface shadow-[0_0_50px_rgba(245,158,11,0.15)]'
              : 'border-ops-border bg-ops-surface shadow-[0_0_50px_rgba(6,182,212,0.15)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ops-border bg-ops-bg/90 px-5 py-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                  isDanger
                    ? 'bg-red-950/80 border-red-500/40 text-red-400 shadow-crimson-glow'
                    : isWarning
                    ? 'bg-amber-950/80 border-amber-500/40 text-amber-400'
                    : 'bg-cyan-950/80 border-ops-cyan/40 text-ops-cyan shadow-cyan-glow'
                }`}
              >
                {isDanger ? (
                  <Trash2 className="h-5 w-5" />
                ) : isWarning ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Info className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-ops-text-main tracking-tight">{title}</h3>
                <p
                  className={`text-[11px] font-mono ${
                    isDanger ? 'text-red-400/80' : isWarning ? 'text-amber-400/80' : 'text-ops-text-muted'
                  }`}
                >
                  {subtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-ops-text-main disabled:opacity-30 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3">
            <div
              className={`rounded-xl border p-4 text-xs font-mono leading-relaxed ${
                isDanger
                  ? 'border-red-500/20 bg-red-950/20 text-red-200'
                  : isWarning
                  ? 'border-amber-500/20 bg-amber-950/20 text-amber-200'
                  : 'border-ops-border bg-ops-bg/60 text-ops-text-sub'
              }`}
            >
              {message}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-ops-border bg-ops-bg/80 px-5 py-3">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-ops-text-main hover:bg-ops-border/50 transition-colors disabled:opacity-40"
            >
              {cancelText}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              data-testid="confirm-modal-btn"
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-white text-xs font-bold shadow-lg transition-all disabled:opacity-50 ${
                isDanger
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                  : isWarning
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                  : 'bg-ops-cyan hover:bg-cyan-400 text-slate-950 shadow-cyan-glow'
              }`}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isDanger ? (
                <Trash2 className="h-3.5 w-3.5" />
              ) : null}
              <span>{confirmText}</span>
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
