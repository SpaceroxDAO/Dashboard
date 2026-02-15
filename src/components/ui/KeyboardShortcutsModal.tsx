import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

interface ShortcutConfig {
  key: string;
  description: string;
  path?: string;
  action?: () => void;
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutConfig[];
}

export function KeyboardShortcutsModal({ isOpen, onClose, shortcuts }: KeyboardShortcutsModalProps) {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navigationShortcuts = shortcuts.filter((s) => s.path);
  const actionShortcuts = shortcuts.filter((s) => s.action);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="bg-surface-elevated border border-[var(--color-border-panel)] rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden panel-glow"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-panel)]">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-signal-primary" />
                  <h2 className="text-lg font-semibold text-text-bright">Keyboard Shortcuts</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-hover"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[60vh] space-y-6">
                {/* Navigation */}
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-3">Navigation</h3>
                  <div className="grid gap-2">
                    {navigationShortcuts.map((shortcut) => (
                      <div key={shortcut.key} className="flex items-center justify-between">
                        <span className="text-sm text-text-muted">{shortcut.description}</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-surface-base border border-[var(--color-border-panel)] rounded text-text-bright">
                          {shortcut.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-3">Actions</h3>
                  <div className="grid gap-2">
                    {actionShortcuts.map((shortcut) => (
                      <div key={shortcut.key} className="flex items-center justify-between">
                        <span className="text-sm text-text-muted">{shortcut.description}</span>
                        <kbd className="px-2 py-1 text-xs font-mono bg-surface-base border border-[var(--color-border-panel)] rounded text-text-bright">
                          {shortcut.key}
                        </kbd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Refresh Stats</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-surface-base border border-[var(--color-border-panel)] rounded text-text-bright">
                        r
                      </kbd>
                    </div>
                  </div>
                </div>

                {/* Power User */}
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-3">Power User</h3>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Command Palette</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-surface-base border border-[var(--color-border-panel)] rounded text-text-bright">
                        ⌘K
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-muted">Quick Search</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-surface-base border border-[var(--color-border-panel)] rounded text-text-bright">
                        /
                      </kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer hint */}
              <div className="px-4 py-3 border-t border-[var(--color-border-panel)] bg-surface-base/50">
                <p className="text-xs text-text-dim text-center">
                  Press <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-text-muted">?</kbd> anytime to toggle this menu
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
