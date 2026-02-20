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
      <div className="space-y-1.5 max-w-md mx-auto">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className="flex items-center gap-2.5 p-2.5 bg-surface-elevated rounded-lg hover:bg-surface-hover transition-colors">
            <div className="p-1.5 rounded-md bg-surface-hover text-signal-primary"><item.icon className="w-4 h-4" /></div>
            <span className="flex-1 text-sm font-medium text-text-bright">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-text-dim" />
          </Link>
        ))}
        <button className="w-full flex items-center gap-2.5 p-2.5 bg-surface-elevated rounded-lg hover:bg-surface-hover transition-colors mt-2">
          <div className="p-1.5 rounded-md bg-signal-alert/20 text-signal-alert"><LogOut className="w-4 h-4" /></div>
          <span className="flex-1 text-sm font-medium text-text-bright text-left">Sign Out</span>
        </button>
      </div>
    </PageContainer>
  );
}
