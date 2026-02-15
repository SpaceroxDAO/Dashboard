import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Mail, MapPin, Heart, Loader2 } from 'lucide-react';
import type { QuickAction } from '@/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sun: Sun,
  mail: Mail,
  'map-pin': MapPin,
  heart: Heart,
};

interface QuickActionsProps {
  actions: QuickAction[];
  onAction?: (action: QuickAction) => Promise<void>;
}

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = async (action: QuickAction) => {
    if (!onAction) return;
    setLoadingId(action.id);
    try {
      await onAction(action);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4">Quick Actions</h2>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => {
          const Icon = iconMap[action.icon] || Sun;
          const isLoading = loadingId === action.id;

          return (
            <motion.button
              key={action.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction(action)}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface-hover hover:bg-surface-active rounded-lg text-text-bright font-medium disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span>{action.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
