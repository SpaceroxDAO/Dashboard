import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AccordionGroupProps {
  title: string;
  count: number;
  icon?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function AccordionGroup({
  title,
  count,
  icon,
  expanded,
  onToggle,
  children,
}: AccordionGroupProps) {
  return (
    <div className="bg-surface-elevated panel-glow rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        {icon && <span className="text-signal-primary">{icon}</span>}
        <span className="flex-1 font-medium text-text-bright">{title}</span>
        <span className="text-sm text-text-dim">{count}</span>
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-dim"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border-panel)] p-4 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
