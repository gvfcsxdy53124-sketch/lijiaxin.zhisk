import {SkillCenterPage} from './SkillCenterPage';

export function SkillsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-8 py-6">
      <div className="mx-auto max-w-[1600px]">
        <SkillCenterPage activePageKey="templates" activePageLabel="Skill 模板库" />
      </div>
    </div>
  );
}
