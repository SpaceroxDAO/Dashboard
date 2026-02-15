import { Link } from 'react-router-dom';
import { Calendar, Settings, LogOut, ChevronRight } from 'lucide-react';
import { PageContainer } from '@/components/layout';

const menuItems = [
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function MorePage() {
  return (
    <PageContainer title="More">
      <div className="space-y-2 max-w-md mx-auto">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center gap-3 p-4 bg-surface-elevated rounded-xl hover:bg-surface-hover transition-colors"
          >
            <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
              <item.icon className="w-5 h-5" />
            </div>
            <span className="flex-1 font-medium text-text-bright">{item.label}</span>
            <ChevronRight className="w-5 h-5 text-text-dim" />
          </Link>
        ))}

        <button className="w-full flex items-center gap-3 p-4 bg-surface-elevated rounded-xl hover:bg-surface-hover transition-colors mt-4">
          <div className="p-2 rounded-lg bg-signal-alert/20 text-signal-alert">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="flex-1 font-medium text-text-bright text-left">Sign Out</span>
        </button>
      </div>
    </PageContainer>
  );
}
