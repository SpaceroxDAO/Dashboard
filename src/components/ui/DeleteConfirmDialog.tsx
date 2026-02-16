import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: string;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  isOpen, onClose, onConfirm, itemName, itemType, loading,
}: DeleteConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.25 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div
              className="bg-surface-elevated border border-signal-alert/30 rounded-xl shadow-2xl max-w-sm w-full p-6 panel-glow"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-full bg-signal-alert/20">
                  <AlertTriangle className="w-5 h-5 text-signal-alert" />
                </div>
                <h3 className="font-semibold text-text-bright">Delete {itemType}?</h3>
              </div>
              <p className="text-sm text-text-muted mb-6">
                Are you sure you want to delete <span className="text-text-bright font-medium">"{itemName}"</span>?
                This action cannot be undone.
              </p>
              <div className="flex items-center gap-3 justify-end">
                <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={onConfirm} disabled={loading}>
                  Delete
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
