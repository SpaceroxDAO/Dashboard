import { SkillCard } from './SkillCard';
import type { Skill } from '@/types';

interface SkillListProps {
  skills: Skill[];
  onToggle?: (skillId: string, enabled: boolean) => Promise<void>;
  onClick?: (skill: Skill) => void;
}

export function SkillList({ skills, onToggle, onClick }: SkillListProps) {
  const categories: Record<string, Skill[]> = {};
  skills.forEach((skill) => {
    if (!categories[skill.category]) categories[skill.category] = [];
    categories[skill.category].push(skill);
  });

  const categoryOrder = ['core', 'integration', 'custom'];
  const categoryLabels: Record<string, string> = {
    core: 'Core Skills', integration: 'Integrations', custom: 'Custom Skills',
  };

  const sortedCategories = Object.entries(categories).sort(
    ([a], [b]) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="space-y-3">
      {sortedCategories.map(([category, categorySkills]) => (
        <div key={category}>
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
            {categoryLabels[category] || category}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categorySkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onToggle={onToggle} onClick={onClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
