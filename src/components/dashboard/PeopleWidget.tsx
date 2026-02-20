import { useAtom } from 'jotai';
import { Users, AlertCircle, Cake } from 'lucide-react';
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
  return { daysUntil, display: `${monthNames[month - 1]} ${day}` };
}

function PersonRow({ person }: { person: TrackedPerson }) {
  const daysSince = getDaysSinceContact(person.last_contact);
  const overdue = isOverdue(person);

  return (
    <div className="flex items-center gap-1.5 py-0.5 border-b border-surface-hover/40 last:border-0 text-[11px]">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overdue ? 'bg-signal-caution' : 'bg-signal-online'}`} />
      <span className="font-medium text-text-bright w-16 truncate flex-shrink-0">{person.name}</span>
      <span className={`px-1 py-px rounded text-[10px] flex-shrink-0 ${relationshipColors[person.relationship] || 'bg-surface-active text-text-muted'}`}>
        {person.relationship}
      </span>
      {person.location && (
        <span className="text-text-dim truncate hidden sm:inline">{person.location}</span>
      )}
      <span className="ml-auto flex-shrink-0 text-text-dim telemetry-value">
        {person.cadence_days}d
      </span>
      <span className={`flex-shrink-0 telemetry-value w-12 text-right ${overdue ? 'text-signal-caution' : 'text-text-dim'}`}>
        {daysSince !== null ? `${daysSince}d` : 'never'}
      </span>
    </div>
  );
}

export function PeopleWidget() {
  const [tracker] = useAtom(peopleTrackerAtom);

  if (!tracker || !tracker.people || tracker.people.length === 0) {
    return (
      <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
        <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-signal-primary" />
          People
        </h2>
        <div className="text-center py-3">
          <p className="text-xs text-text-dim">No contacts tracked yet</p>
        </div>
      </div>
    );
  }

  const upcomingBirthdays = tracker.people
    .map(p => ({ person: p, birthday: getUpcomingBirthday(p.birthday) }))
    .filter((b): b is { person: TrackedPerson; birthday: { daysUntil: number; display: string } } => b.birthday !== null)
    .sort((a, b) => a.birthday.daysUntil - b.birthday.daysUntil);

  const family = tracker.people.filter(p => familyRelationships.includes(p.relationship));
  const friends = tracker.people.filter(p => !familyRelationships.includes(p.relationship));
  const overdueCount = tracker.people.filter(isOverdue).length;

  return (
    <div className="bg-surface-elevated rounded-xl p-3 panel-glow">
      <h2 className="text-sm font-semibold text-text-bright mb-2 flex items-center gap-1.5">
        <Users className="w-4 h-4 text-signal-primary" />
        People
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {overdueCount > 0 && (
            <span className="text-signal-caution flex items-center gap-0.5">
              <AlertCircle className="w-2.5 h-2.5" />
              {overdueCount}
            </span>
          )}
          <span className="text-text-dim telemetry-value">{tracker.people.length}</span>
        </span>
      </h2>

      {upcomingBirthdays.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] rounded px-2 py-1 border border-signal-caution/20 bg-signal-caution/5">
          <Cake className="w-3 h-3 text-signal-caution flex-shrink-0" />
          {upcomingBirthdays.map(({ person, birthday }) => (
            <span key={person.name}>
              <span className="text-text-bright font-medium">{person.name}</span>
              <span className="text-signal-caution ml-1">
                {birthday.daysUntil === 0 ? 'today' : birthday.daysUntil === 1 ? 'tomorrow' : `${birthday.display} (${birthday.daysUntil}d)`}
              </span>
            </span>
          ))}
        </div>
      )}

      {family.length > 0 && (
        <div className="mb-1.5">
          <div className="text-[10px] font-medium text-text-dim uppercase tracking-wider mb-0.5">Family</div>
          {family.map(person => <PersonRow key={person.name} person={person} />)}
        </div>
      )}

      {friends.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-text-dim uppercase tracking-wider mb-0.5">Friends</div>
          {friends.map(person => <PersonRow key={person.name} person={person} />)}
        </div>
      )}
    </div>
  );
}
