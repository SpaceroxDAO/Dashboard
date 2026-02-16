import { useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import { Settings, FileText, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { SkillList } from '@/components/skills';
import { Badge, DetailModal } from '@/components/ui';
import { skillsAtom, allSkillsAtom, addToastAtom } from '@/store/atoms';
import { toggleSkill, getSkillDetail } from '@/services/api';
import type { Skill } from '@/types';

interface SkillDetailData {
  id: string;
  documentation: string;
  files: string[];
  fileCount: number;
  enabled: boolean;
}

export function SkillsPage() {
  const [skills] = useAtom(skillsAtom);
  const [, setAllSkills] = useAtom(allSkillsAtom);
  const [, addToast] = useAtom(addToastAtom);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillDetail, setSkillDetail] = useState<SkillDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleToggle = useCallback(async (skillId: string, enabled: boolean) => {
    try {
      const result = await toggleSkill(skillId, enabled);
      // Update the atom with the new enabled state
      setAllSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, enabled: result.enabled } : s))
      );
      addToast({
        message: `Skill "${skillId}" ${result.enabled ? 'enabled' : 'disabled'}`,
        type: 'success',
      });
    } catch {
      addToast({ message: 'Failed to toggle skill', type: 'error' });
    }
  }, [setAllSkills, addToast]);

  const handleClick = useCallback(async (skill: Skill) => {
    setSelectedSkill(skill);
    setSkillDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await getSkillDetail(skill.id);
      setSkillDetail(detail);
    } catch {
      addToast({ message: 'Failed to load skill details', type: 'error' });
    } finally {
      setLoadingDetail(false);
    }
  }, [addToast]);

  // Stats
  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <PageContainer
      title={`Skills (${skills.length})`}
      actions={
        <Badge variant="info">
          {enabledCount}/{skills.length} active
        </Badge>
      }
    >
      <SkillList
        skills={skills}
        onToggle={handleToggle}
        onClick={handleClick}
      />

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <DetailModal
          isOpen={!!selectedSkill}
          onClose={() => { setSelectedSkill(null); setSkillDetail(null); }}
          title={selectedSkill.name}
          subtitle={selectedSkill.description}
          icon={<Settings className="w-5 h-5" />}
          size="lg"
        >
          <div className="p-6 space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-text-dim mb-0.5">Status</div>
                <Badge variant={selectedSkill.enabled ? 'success' : 'default'}>
                  {selectedSkill.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-text-dim mb-0.5">Category</div>
                <div className="text-sm text-text-bright capitalize">{selectedSkill.category}</div>
              </div>
              {skillDetail && (
                <div>
                  <div className="text-xs text-text-dim mb-0.5">Files</div>
                  <div className="text-sm text-text-bright">{skillDetail.fileCount} files</div>
                </div>
              )}
              {selectedSkill.commands && selectedSkill.commands.length > 0 && (
                <div>
                  <div className="text-xs text-text-dim mb-0.5">Commands</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedSkill.commands.map((cmd) => (
                      <span
                        key={cmd}
                        className="text-xs px-1.5 py-0.5 bg-surface-hover rounded font-mono text-text-dim"
                      >
                        {cmd}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Documentation */}
            <div>
              <h4 className="text-sm font-medium text-text-muted mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Documentation
              </h4>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-text-dim py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading documentation...
                </div>
              ) : skillDetail?.documentation ? (
                <div className="bg-surface-base rounded-lg p-4 text-sm text-text-bright whitespace-pre-wrap font-mono max-h-96 overflow-y-auto leading-relaxed">
                  {skillDetail.documentation}
                </div>
              ) : (
                <div className="text-sm text-text-dim py-4 text-center">
                  No documentation available
                </div>
              )}
            </div>

            {/* File list */}
            {skillDetail && skillDetail.files.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-muted mb-2">Skill Files</h4>
                <div className="space-y-1">
                  {skillDetail.files.map((file) => (
                    <div
                      key={file}
                      className="text-xs font-mono text-text-dim bg-surface-base rounded px-3 py-1.5 truncate"
                    >
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DetailModal>
      )}
    </PageContainer>
  );
}
