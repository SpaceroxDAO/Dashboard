import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui';

interface StatCardProps {
  value: string | number;
  label: string;
  subtitle?: string;
  accentColor?: string;
  icon?: ReactNode;
  trend?: { value: number; direction: 'up' | 'down' };
  onClick?: () => void;
}

export function StatCard({
  value,
  label,
  subtitle,
  accentColor,
  icon,
  trend,
  onClick,
}: StatCardProps) {
  return (
    <motion.div whileHover={{ scale: onClick ? 1.02 : 1, y: onClick ? -2 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }} whileTap={{ scale: onClick ? 0.98 : 1 }}>
      <Card
        hover={!!onClick}
        onClick={onClick}
        accentColor={accentColor}
        className="flex flex-col h-full"
      >
        {/* Header with icon and trend */}
        <div className="flex items-start justify-between mb-3">
          {icon && (
            <div className="p-2 rounded-lg bg-signal-primary/10 text-signal-primary">
              {icon}
            </div>
          )}
          {trend && (
            <div
              className={`flex items-center gap-1 text-sm font-medium ${
                trend.direction === 'up' ? 'text-signal-online' : 'text-signal-alert'
              }`}
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{trend.value}%</span>
            </div>
          )}
        </div>

        {/* Value — telemetry readout style */}
        <AnimatePresence mode="wait">
          <motion.div
            key={String(value)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-2xl sm:text-3xl font-bold text-text-bright mb-1 telemetry-value"
          >
            {value}
          </motion.div>
        </AnimatePresence>

        {/* Label */}
        <div className="text-sm font-medium text-text-muted">{label}</div>

        {/* Subtitle */}
        {subtitle && (
          <div className="text-xs text-text-dim mt-1 truncate">{subtitle}</div>
        )}
      </Card>
    </motion.div>
  );
}
