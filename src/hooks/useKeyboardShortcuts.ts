import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAtom } from 'jotai';
import { sidebarCollapsedAtom } from '@/store/atoms';

interface ShortcutConfig {
  key: string;
  description: string;
  path?: string;
  action?: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const shortcuts: ShortcutConfig[] = [
    { key: '1', description: 'Dashboard', path: '/' },
    { key: '2', description: 'DNA', path: '/dna' },
    { key: '3', description: 'Memory', path: '/memory' },
    { key: '4', description: 'Skills', path: '/skills' },
    { key: '5', description: 'Cron Jobs', path: '/crons' },
    { key: '6', description: 'Schedule', path: '/schedule' },
    { key: '7', description: 'Goals', path: '/goals' },
    { key: '8', description: 'To-Do List', path: '/todos' },
    { key: '9', description: 'Missions', path: '/missions' },
    { key: '0', description: 'Settings', path: '/settings' },
    { key: '[', description: 'Toggle Sidebar', action: () => setSidebarCollapsed((prev) => !prev) },
    { key: 'Escape', description: 'Back to Dashboard', path: '/' },
    { key: '?', description: 'Show Shortcuts', action: () => setShowShortcuts((prev) => !prev) },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      // Don't trigger with modifier keys (except for ?)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const key = e.key;
      const shortcut = shortcuts.find((s) => s.key === key || (key === '/' && s.key === '?'));

      if (shortcut) {
        e.preventDefault();
        if (shortcut.path) {
          // Don't navigate if already on the page
          if (location.pathname !== shortcut.path) {
            navigate(shortcut.path);
          }
        } else if (shortcut.action) {
          shortcut.action();
        }
      }
    },
    [navigate, location.pathname, setSidebarCollapsed]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts, showShortcuts, setShowShortcuts };
}
