import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sun, Mail, MapPin, Heart, Loader2, Calendar, Moon,
  BarChart, Play, Terminal, Clock, Globe, CheckCircle,
  Zap, RefreshCw, Save, DollarSign,
} from 'lucide-react';
import type { QuickAction } from '@/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sun: Sun, mail: Mail, 'map-pin': MapPin, heart: Heart,
  calendar: Calendar, moon: Moon, 'bar-chart': BarChart, play: Play,
  terminal: Terminal, clock: Clock, globe: Globe, 'check-circle': CheckCircle,
  zap: Zap, 'refresh-cw': RefreshCw, save: Save, 'dollar-sign': DollarSign,
};

interface QuickActionsProps {
  actions: QuickAction[];
  onAction?: (action: QuickAction) => Promise<void>;
}

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, 'success' | 'failed'>>({});

  const handleAction = async (action: QuickAction) => {
    if (!onAction) return;
    setLoadingId(action.id);
    try {
      await onAction(action);
      setLastResult(prev => ({ ...prev, [action.id]: 'success' }));
      setTimeout(() => setLastResult(prev => {
        const next = { ...prev };
        delete next[action.id];
        return next;
      }), 3000);
    } catch {
      setLastResult(prev => ({ ...prev, [action.id]: 'failed' }));
      setTimeout(() => setLastResult(prev => {
        const next = { ...prev };
        delete next[action.id];
        return next;
      }), 5000);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2">Quick Actions</h2>
      {actions.length === 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-text-dim">No quick actions configured</p>
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((action) => {
            const Icon = iconMap[action.icon] || Zap;
            const isLoading = loadingId === action.id;
            const result = lastResult[action.id];

            return (
              <motion.button
                key={action.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAction(action)}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 transition-colors ${
                  result === 'success'
                    ? 'bg-signal-online/20 text-signal-online'
                    : result === 'failed'
                    ? 'bg-signal-alert/20 text-signal-alert'
                    : 'bg-surface-hover hover:bg-surface-active text-text-bright'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : result === 'success' ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                <span>{action.label}</span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
