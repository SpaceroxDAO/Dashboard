import { useAtom } from 'jotai';
import { Monitor, Moon, Sun, Bell, Shield, Database, Info } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { themeAtom, activeAgentAtom } from '@/store/atoms';

export function SettingsPage() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [activeAgent] = useAtom(activeAgentAtom);

  const themeOptions = [
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

  const sections = [
    {
      title: 'Appearance',
      icon: Monitor,
      content: (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-muted mb-2 block">
              Theme
            </label>
            <div className="flex gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                    ${theme === option.value
                      ? 'bg-signal-primary text-white shadow-[0_0_12px_var(--color-glow-primary)]'
                      : 'bg-surface-hover text-text-muted hover:text-text-bright'
                    }
                  `}
                >
                  <option.icon className="w-4 h-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Notifications',
      icon: Bell,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-text-bright">Push Notifications</div>
              <div className="text-sm text-text-muted">Receive alerts for cron completions</div>
            </div>
            <button className="relative w-11 h-6 rounded-full bg-signal-primary transition-colors">
              <div className="absolute top-1 left-[22px] w-4 h-4 rounded-full bg-white" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-text-bright">Email Summaries</div>
              <div className="text-sm text-text-muted">Daily digest of agent activity</div>
            </div>
            <button className="relative w-11 h-6 rounded-full bg-surface-hover transition-colors">
              <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white" />
            </button>
          </div>
        </div>
      ),
    },
    {
      title: 'Agent Configuration',
      icon: Database,
      content: (
        <div className="space-y-4">
          {activeAgent && (
            <div className="flex items-center gap-4 p-4 bg-surface-hover rounded-lg">
              <span className="text-3xl">{activeAgent.emoji}</span>
              <div className="flex-1">
                <div className="font-medium text-text-bright">{activeAgent.name}</div>
                <div className="text-sm text-text-muted">{activeAgent.config.url}</div>
              </div>
              <Button variant="secondary" size="sm">Configure</Button>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Security',
      icon: Shield,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-text-bright">Biometric Authentication</div>
              <div className="text-sm text-text-muted">Use Face ID or Touch ID to unlock</div>
            </div>
            <button className="relative w-11 h-6 rounded-full bg-signal-primary transition-colors">
              <div className="absolute top-1 left-[22px] w-4 h-4 rounded-full bg-white" />
            </button>
          </div>
        </div>
      ),
    },
    {
      title: 'About',
      icon: Info,
      content: (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Version</span>
            <span className="text-text-bright">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Build</span>
            <span className="text-text-bright">2026.02.09</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <PageContainer title="Settings">
      <div className="space-y-4 max-w-2xl">
        {sections.map((section) => (
          <Card key={section.title}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-surface-hover text-signal-primary">
                <section.icon className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-text-bright">{section.title}</h2>
            </div>
            {section.content}
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
