import {Database, FileText, Plus, ShieldCheck} from 'lucide-react';
import {Badge} from '@/components/ui/Badge';
import {StatCard} from '@/components/ui/StatCard';
import {knowledgeBases} from '@/constants/mockData';
import {numberFormatter, statusText, visibilityText} from '@/utils/format';

const statusVariant = {
  ready: 'success',
  processing: 'warning',
  error: 'danger',
} as const;

export function KnowledgePage() {
  const totalDocs = knowledgeBases.reduce((sum, item) => sum + item.documentCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Knowledge Base</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">知识库管理</h2>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800" type="button">
          <Plus className="h-4 w-4" />
          新建知识库
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="知识库总数" value={`${knowledgeBases.length}`} icon={Database} trend="+12%" />
        <StatCard label="文档总量" value={numberFormatter.format(totalDocs)} icon={FileText} trend="+8%" />
        <StatCard label="私有/受限库" value="3" icon={ShieldCheck} trend="权限正常" />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">知识库列表</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {knowledgeBases.map((item) => (
            <article key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_180px_150px_120px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-slate-950">{item.name}</h4>
                  <Badge variant={statusVariant[item.status]}>{statusText[item.status]}</Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="text-sm">
                <p className="text-slate-500">负责人</p>
                <p className="mt-1 font-medium text-slate-900">{item.owner}</p>
              </div>
              <div className="text-sm">
                <p className="text-slate-500">权限</p>
                <p className="mt-1 font-medium text-slate-900">{visibilityText[item.visibility]}</p>
              </div>
              <div className="text-sm">
                <p className="text-slate-500">文档数</p>
                <p className="mt-1 font-medium text-slate-900">{item.documentCount}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
