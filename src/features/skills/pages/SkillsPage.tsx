import {Badge} from '@/components/ui/Badge';
import {skillTemplates} from '@/constants/mockData';
import {numberFormatter} from '@/utils/format';

export function SkillsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Skill Orchestration</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">技能编排</h2>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {skillTemplates.map((skill) => (
          <article key={skill.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{skill.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{skill.scenario}</p>
              </div>
              <Badge variant={skill.enabled ? 'success' : 'neutral'}>{skill.enabled ? '启用' : '停用'}</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">模型</dt>
                <dd className="mt-1 font-medium text-slate-950">{skill.model}</dd>
              </div>
              <div>
                <dt className="text-slate-500">调用</dt>
                <dd className="mt-1 font-medium text-slate-950">{numberFormatter.format(skill.calls)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">成功率</dt>
                <dd className="mt-1 font-medium text-slate-950">{skill.successRate}%</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
