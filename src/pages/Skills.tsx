import { useAtom } from 'jotai';
import { PageContainer } from '@/components/layout';
import { SkillList } from '@/components/skills';
import { skillsAtom, addToastAtom } from '@/store/atoms';
import type { Skill } from '@/types';

export function SkillsPage() {
  const [skills] = useAtom(skillsAtom);
  const [, addToast] = useAtom(addToastAtom);

  const handleToggle = async (skillId: string, enabled: boolean) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    addToast({
      message: `Skill "${skillId}" ${enabled ? 'enabled' : 'disabled'}`,
      type: 'success',
    });
  };

  const handleClick = (skill: Skill) => {
    addToast({
      message: `Skill detail modal for "${skill.name}" would open here`,
      type: 'info',
    });
  };

  return (
    <PageContainer title="Skills">
      <SkillList
        skills={skills}
        onToggle={handleToggle}
        onClick={handleClick}
      />
    </PageContainer>
  );
}
