import { useAtom } from 'jotai';
import { Users, AlertCircle } from 'lucide-react';
import { peopleTrackerAtom } from '@/store/atoms';

export function PeopleWidget() {
  const [tracker] = useAtom(peopleTrackerAtom);

  if (!tracker || !tracker.people || tracker.people.length === 0) return null;

  const now = new Date();
  const overdueContacts = tracker.people.filter(p => {
    if (!p.last_contact) return true;
    const last = new Date(p.last_contact);
    const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > p.cadence_days;
  });

  const recentContacts = tracker.people
    .filter(p => p.last_contact)
    .sort((a, b) => new Date(b.last_contact!).getTime() - new Date(a.last_contact!).getTime())
    .slice(0, 5);

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-signal-primary" />
        People
        <span className="ml-auto text-xs text-text-dim telemetry-value">{tracker.people.length} tracked</span>
      </h2>

      {/* Overdue nudges */}
      {overdueContacts.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-signal-caution uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Overdue ({overdueContacts.length})
          </div>
          <div className="space-y-1.5">
            {overdueContacts.slice(0, 3).map((person) => (
              <div key={person.name} className="flex items-center justify-between text-xs bg-signal-caution/5 rounded-md px-2.5 py-1.5 border border-signal-caution/10">
                <span className="text-text-bright">{person.name}</span>
                <span className="text-text-dim">{person.contact_method}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent contacts */}
      <div className="space-y-1.5">
        {recentContacts.map((person) => {
          const daysSince = person.last_contact
            ? Math.floor((now.getTime() - new Date(person.last_contact).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return (
            <div key={person.name} className="flex items-center justify-between text-xs">
              <span className="text-text-muted">{person.name}</span>
              <span className="text-text-dim telemetry-value">
                {daysSince !== null ? `${daysSince}d ago` : 'never'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
