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
  value, label, subtitle, accentColor, icon, trend, onClick,
}: StatCardProps) {
  return (
    <motion.div whileHover={{ scale: onClick ? 1.02 : 1, y: onClick ? -1 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }} whileTap={{ scale: onClick ? 0.98 : 1 }}>
      <Card hover={!!onClick} onClick={onClick} accentColor={accentColor} className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-1.5">
          {icon && (
            <div className="p-1.5 rounded-md bg-signal-primary/10 text-signal-primary">
              {icon}
            </div>
          )}
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${
              trend.direction === 'up' ? 'text-signal-online' : 'text-signal-alert'
            }`}>
              {trend.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trend.value}%</span>
            </div>
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={String(value)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-xl font-bold text-text-bright telemetry-value"
          >
            {value}
          </motion.div>
        </AnimatePresence>
        <div className="text-xs font-medium text-text-muted">{label}</div>
        {subtitle && <div className="text-[10px] text-text-dim mt-0.5 truncate">{subtitle}</div>}
      </Card>
    </motion.div>
  );
}
