import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mail, Heart, MapPin, Calendar, Cloud, Brain, Clock, FileText,
  Bell, Search, Newspaper, Music, Zap, Settings
} from 'lucide-react';
import type { Skill } from '@/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail,
  heart: Heart,
  'map-pin': MapPin,
  calendar: Calendar,
  cloud: Cloud,
  brain: Brain,
  clock: Clock,
  'file-text': FileText,
  bell: Bell,
  search: Search,
  newspaper: Newspaper,
  music: Music,
  zap: Zap,
};

interface SkillCardProps {
  skill: Skill;
  onToggle?: (skillId: string, enabled: boolean) => Promise<void>;
  onClick?: (skill: Skill) => void;
}

export function SkillCard({ skill, onToggle, onClick }: SkillCardProps) {
  const [toggling, setToggling] = useState(false);
  const Icon = iconMap[skill.icon || ''] || Settings;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggle) return;
    setToggling(true);
    try {
      await onToggle(skill.id, !skill.enabled);
    } finally {
      setToggling(false);
    }
  };

  const categoryColors = {
    core: 'var(--color-signal-primary)',
    integration: 'var(--color-signal-online)',
    custom: 'var(--color-signal-secondary)',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(skill)}
      className={`
        bg-surface-elevated panel-glow rounded-xl p-4 cursor-pointer transition-colors
        ${skill.enabled ? 'hover:bg-surface-hover' : 'opacity-60'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="p-2.5 rounded-lg"
          style={{
            backgroundColor: `${categoryColors[skill.category]}20`,
            color: categoryColors[skill.category],
          }}
        >
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-text-bright truncate">{skill.name}</h3>
          </div>
          <p className="text-sm text-text-muted mt-0.5 line-clamp-2">
            {skill.description}
          </p>
          {skill.commands && skill.commands.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {skill.commands.slice(0, 3).map((cmd) => (
                <span
                  key={cmd}
                  className="text-xs px-1.5 py-0.5 bg-surface-hover rounded font-mono text-text-dim"
                >
                  {cmd}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`
            relative w-11 h-6 rounded-full transition-colors
            ${skill.enabled ? 'bg-signal-primary' : 'bg-surface-hover'}
            ${toggling ? 'opacity-50' : ''}
          `}
        >
          <motion.div
            animate={{ x: skill.enabled ? 22 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-1 w-4 h-4 rounded-full bg-white"
          />
        </button>
      </div>
    </motion.div>
  );
}
