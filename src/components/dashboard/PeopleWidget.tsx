import { useAtom } from 'jotai';
import { Users, AlertCircle, Cake, MapPin, MessageCircle, Clock } from 'lucide-react';
import { peopleTrackerAtom } from '@/store/atoms';
import type { TrackedPerson } from '@/types';

const relationshipColors: Record<string, string> = {
  sister: 'bg-signal-primary/20 text-signal-primary',
  brother: 'bg-signal-primary/20 text-signal-primary',
  'step-brother': 'bg-signal-primary/20 text-signal-primary',
  friend: 'bg-signal-secondary/20 text-signal-secondary',
};

const familyRelationships = ['sister', 'brother', 'step-brother', 'mother', 'father', 'parent'];

function getDaysSinceContact(lastContact: string | null): number | null {
  if (!lastContact) return null;
  const now = new Date();
  const last = new Date(lastContact);
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(person: TrackedPerson): boolean {
  if (!person.last_contact) return true;
  const daysSince = getDaysSinceContact(person.last_contact);
  return daysSince !== null && daysSince > person.cadence_days;
}

function getUpcomingBirthday(birthday: string | null): { daysUntil: number; display: string } | null {
  if (!birthday) return null;
  const now = new Date();
  const [month, day] = birthday.split('-').map(Number);
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  const nextYear = new Date(now.getFullYear() + 1, month - 1, day);

  const target = thisYear.getTime() >= now.getTime() - 86400000 ? thisYear : nextYear;
  const daysUntil = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil > 14) return null;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    daysUntil,
    display: `${monthNames[month - 1]} ${day}`,
  };
}

function PersonRow({ person }: { person: TrackedPerson }) {
  const daysSince = getDaysSinceContact(person.last_contact);
  const overdue = isOverdue(person);

  return (
    <div className="bg-surface-hover/40 rounded-lg p-3 flex items-start gap-3">
      {overdue && (
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-signal-caution" />
      )}
      {!overdue && (
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-signal-online" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-bright">{person.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-md ${relationshipColors[person.relationship] || 'bg-surface-active text-text-muted'}`}>
            {person.relationship}
          </span>
          {person.location && (
            <span className="text-xs text-text-dim flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {person.location}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-text-dim">
          <span className="flex items-center gap-0.5">
            <MessageCircle className="w-3 h-3" />
            {person.contact_method}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            every {person.cadence_days}d
          </span>
          <span className={overdue ? 'text-signal-caution' : ''}>
            {daysSince !== null ? `${daysSince}d ago` : 'never contacted'}
          </span>
        </div>
        {person.notes && (
          <div className="text-xs text-text-muted mt-1">{person.notes}</div>
        )}
      </div>
    </div>
  );
}

export function PeopleWidget() {
  const [tracker] = useAtom(peopleTrackerAtom);

  if (!tracker || !tracker.people || tracker.people.length === 0) {
    return (
      <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
        <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-signal-primary" />
          People
        </h2>
        <div className="text-center py-6">
          <Users className="w-8 h-8 text-text-dim/30 mx-auto mb-2" />
          <p className="text-sm text-text-dim">No contacts tracked yet</p>
          <p className="text-xs text-text-muted mt-1">People will appear after relationship checks</p>
        </div>
      </div>
    );
  }

  // Birthday alerts (within 14 days)
  const upcomingBirthdays = tracker.people
    .map(p => ({ person: p, birthday: getUpcomingBirthday(p.birthday) }))
    .filter((b): b is { person: TrackedPerson; birthday: { daysUntil: number; display: string } } => b.birthday !== null)
    .sort((a, b) => a.birthday.daysUntil - b.birthday.daysUntil);

  // Group by relationship
  const family = tracker.people.filter(p => familyRelationships.includes(p.relationship));
  const friends = tracker.people.filter(p => !familyRelationships.includes(p.relationship));

  const overdueCount = tracker.people.filter(isOverdue).length;

  return (
    <div className="bg-surface-elevated rounded-xl p-4 lg:p-6 panel-glow">
      <h2 className="text-lg font-semibold text-text-bright mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-signal-primary" />
        People
        <span className="ml-auto flex items-center gap-3 text-xs">
          {overdueCount > 0 && (
            <span className="text-signal-caution flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {overdueCount} overdue
            </span>
          )}
          <span className="text-text-dim telemetry-value">{tracker.people.length} tracked</span>
        </span>
      </h2>

      {/* Birthday Banner */}
      {upcomingBirthdays.length > 0 && (
        <div className="mb-4 rounded-lg border border-signal-caution/20 bg-signal-caution/5 p-3">
          {upcomingBirthdays.map(({ person, birthday }) => (
            <div key={person.name} className="flex items-center gap-2 text-sm">
              <Cake className="w-4 h-4 text-signal-caution" />
              <span className="text-text-bright font-medium">{person.name}</span>
              <span className="text-text-dim">—</span>
              <span className="text-signal-caution font-medium">
                {birthday.daysUntil === 0
                  ? 'Today!'
                  : birthday.daysUntil === 1
                    ? 'Tomorrow!'
                    : `${birthday.display} (${birthday.daysUntil} days)`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Family Section */}
      {family.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-text-dim uppercase tracking-wider mb-2">
            Family ({family.length})
          </div>
          <div className="space-y-2">
            {family.map(person => (
              <PersonRow key={person.name} person={person} />
            ))}
          </div>
        </div>
      )}

      {/* Friends Section */}
      {friends.length > 0 && (
        <div>
          <div className="text-xs font-medium text-text-dim uppercase tracking-wider mb-2">
            Friends ({friends.length})
          </div>
          <div className="space-y-2">
            {friends.map(person => (
              <PersonRow key={person.name} person={person} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
