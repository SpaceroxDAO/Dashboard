import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutDashboard,
  FolderOpen,
  Zap,
  Clock,
  Calendar,
  Settings,
  Target,
  CheckSquare,
  ListTodo,
  Dna,
  RefreshCw,
  Keyboard,
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  icon: typeof Search;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
}

export function CommandPalette({ isOpen, onClose, onShowShortcuts }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, action: () => navigate('/'), keywords: ['home', 'main'] },
    { id: 'dna', label: 'Go to DNA', icon: Dna, action: () => navigate('/dna'), keywords: ['identity', 'personality'] },
    { id: 'memory', label: 'Go to Memory', icon: FolderOpen, action: () => navigate('/memory'), keywords: ['files', 'storage'] },
    { id: 'skills', label: 'Go to Skills', icon: Zap, action: () => navigate('/skills'), keywords: ['abilities', 'features'] },
    { id: 'crons', label: 'Go to Cron Jobs', icon: Clock, action: () => navigate('/crons'), keywords: ['schedule', 'tasks', 'automation'] },
    { id: 'schedule', label: 'Go to Schedule', icon: Calendar, action: () => navigate('/schedule'), keywords: ['calendar', 'events'] },
    { id: 'goals', label: 'Go to Goals', icon: Target, action: () => navigate('/goals'), keywords: ['objectives', 'targets'] },
    { id: 'todos', label: 'Go to To-Do List', icon: CheckSquare, action: () => navigate('/todos'), keywords: ['tasks', 'checklist'] },
    { id: 'missions', label: 'Go to Missions', icon: ListTodo, action: () => navigate('/missions'), keywords: ['queue', 'jobs'] },
    { id: 'settings', label: 'Go to Settings', icon: Settings, action: () => navigate('/settings'), keywords: ['preferences', 'config'] },
    { id: 'refresh', label: 'Refresh Dashboard', icon: RefreshCw, action: () => { window.location.reload(); }, keywords: ['reload', 'update'] },
    { id: 'shortcuts', label: 'Show Keyboard Shortcuts', icon: Keyboard, action: () => { onClose(); onShowShortcuts(); }, keywords: ['keys', 'hotkeys', 'help'] },
  ];

  const filteredCommands = commands.filter((cmd) => {
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some((k) => k.includes(searchLower))
    );
  });

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeCommand = useCallback((cmd: Command) => {
    cmd.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, executeCommand, onClose]);

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

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', duration: 0.25 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
          >
            <div className="bg-surface-elevated border border-[var(--color-border-panel)] rounded-xl shadow-2xl overflow-hidden mx-4 panel-glow">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-panel)]">
                <Search className="w-5 h-5 text-text-dim" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent text-text-bright placeholder:text-text-dim outline-none"
                />
                <kbd className="px-2 py-1 text-xs bg-surface-base border border-[var(--color-border-panel)] rounded text-text-dim">
                  esc
                </kbd>
              </div>

              {/* Commands list */}
              <div className="max-h-72 overflow-y-auto py-2">
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-8 text-center text-text-dim">
                    No commands found
                  </div>
                ) : (
                  filteredCommands.map((cmd, index) => (
                    <button
                      key={cmd.id}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                        index === selectedIndex
                          ? 'bg-signal-primary/10 text-signal-primary'
                          : 'text-text-muted hover:bg-surface-hover'
                      }`}
                    >
                      <cmd.icon className="w-4 h-4" />
                      <span className="flex-1">{cmd.label}</span>
                      {index === selectedIndex && (
                        <span className="text-xs text-text-dim">↵ to select</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-[var(--color-border-panel)] bg-surface-base/50 flex items-center justify-between text-xs text-text-dim">
                <span>↑↓ to navigate</span>
                <span>↵ to select</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
