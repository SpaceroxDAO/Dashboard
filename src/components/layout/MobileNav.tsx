import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Target, CheckSquare } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/goals', icon: Target, label: 'Goals' },
  { path: '/todos', icon: CheckSquare, label: 'To-Do' },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-[var(--color-border-panel)] z-50 pb-safe">
      <ul className="flex items-center justify-around py-2 px-2 sm:px-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`
                  flex flex-col items-center gap-1 px-3 py-2 rounded-lg
                  ${isActive ? 'text-signal-primary' : 'text-text-muted'}
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
