import { useAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { toastsAtom, removeToastAtom } from '@/store/atoms';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: 'bg-signal-online/20 border-signal-online text-signal-online',
  error: 'bg-signal-alert/20 border-signal-alert text-signal-alert',
  info: 'bg-signal-primary/20 border-signal-primary text-signal-primary',
  warning: 'bg-signal-caution/20 border-signal-caution text-signal-caution',
};

export function ToastContainer() {
  const [toasts] = useAtom(toastsAtom);
  const [, removeToast] = useAtom(removeToastAtom);

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg pointer-events-auto
                bg-surface-elevated border-[var(--color-border-panel)] max-w-sm
              `}
            >
              <div className={colors[toast.type]}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="flex-1 text-sm text-text-bright">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-text-dim hover:text-text-bright"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
