import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard } from 'lucide-react';

interface KeyboardHintProps {
  onClick: () => void;
}

export function KeyboardHint({ onClick }: KeyboardHintProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-show tooltip after 3 seconds if user hasn't interacted
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!dismissed) {
        setShowTooltip(true);
        // Auto-hide tooltip after 4 seconds
        setTimeout(() => setShowTooltip(false), 4000);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [dismissed]);

  // Check localStorage for dismissal
  useEffect(() => {
    const wasDismissed = localStorage.getItem('keyboard-hint-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleClick = () => {
    onClick();
    setDismissed(true);
    localStorage.setItem('keyboard-hint-dismissed', 'true');
  };

  if (dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
      <div className="relative">
        {/* Tooltip */}
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute bottom-full right-0 mb-2 whitespace-nowrap"
            >
              <div className="bg-surface-elevated border border-[var(--color-border-panel)] rounded-lg px-3 py-2 shadow-lg panel-glow">
                <p className="text-sm text-text-muted">
                  Press <kbd className="px-1.5 py-0.5 bg-surface-base border border-[var(--color-border-panel)] rounded text-xs font-mono text-text-bright">?</kbd> for shortcuts
                </p>
              </div>
              {/* Arrow */}
              <div className="absolute bottom-0 right-4 translate-y-full">
                <div className="border-8 border-transparent border-t-[var(--color-border-panel)]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Button */}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1, type: 'spring', stiffness: 200 }}
          onClick={handleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="p-3 bg-surface-elevated border border-[var(--color-border-panel)] rounded-full shadow-lg text-text-muted hover:text-signal-primary hover:border-signal-primary/30 hover:scale-110 panel-glow"
          title="Keyboard shortcuts"
        >
          <Keyboard className="w-5 h-5" />
        </motion.button>
      </div>
    </div>
  );
}
