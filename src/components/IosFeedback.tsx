import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface IosFeedbackContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
}

const IosFeedbackContext = createContext<IosFeedbackContextValue | null>(null);

export function IosFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const confirmDialog = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleResolveConfirm = (accepted: boolean) => {
    if (confirmState) {
      confirmState.resolve(accepted);
      setConfirmState(null);
    }
  };

  return (
    <IosFeedbackContext.Provider value={{ showToast, confirmDialog }}>
      {children}

      {/* iPhone Dynamic-Island Style Toast Pill */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto w-full bg-white/95 backdrop-blur-2xl border border-slate-200/90 shadow-[0_14px_34px_rgba(15,23,42,0.14)] rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  t.variant === 'success'
                    ? 'bg-emerald-50 text-emerald-600'
                    : t.variant === 'error'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-[#007AFF]/10 text-[#007AFF]'
                }`}
              >
                {t.variant === 'success' ? (
                  <CheckCircle2 size={18} />
                ) : t.variant === 'error' ? (
                  <AlertCircle size={18} />
                ) : (
                  <Info size={18} />
                )}
              </div>
              <p className="text-xs font-semibold text-slate-900 flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Native iOS Alert Confirmation Sheet */}
      <AnimatePresence>
        {confirmState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => handleResolveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[310px] bg-white/95 backdrop-blur-2xl rounded-[26px] border border-slate-200/90 shadow-2xl overflow-hidden text-center"
            >
              <div className="px-6 pt-6 pb-5">
                <h3 className="text-base font-bold text-slate-900">{confirmState.options.title}</h3>
                <p className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">
                  {confirmState.options.message}
                </p>
              </div>
              <div className="grid grid-cols-2 border-t border-slate-200/80 divide-x divide-slate-200/80">
                <button
                  type="button"
                  onClick={() => handleResolveConfirm(false)}
                  className="py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  {confirmState.options.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveConfirm(true)}
                  className={`py-3.5 text-sm font-bold hover:bg-slate-50 active:bg-slate-100 transition-colors ${
                    confirmState.options.destructive ? 'text-rose-600' : 'text-[#007AFF]'
                  }`}
                >
                  {confirmState.options.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IosFeedbackContext.Provider>
  );
}

export function useIosFeedback() {
  const ctx = useContext(IosFeedbackContext);
  if (!ctx) {
    return {
      showToast: (msg: string) => console.log('[Toast]', msg),
      confirmDialog: async (opts: ConfirmOptions) => window.confirm(`${opts.title}\n\n${opts.message}`),
    };
  }
  return ctx;
}
