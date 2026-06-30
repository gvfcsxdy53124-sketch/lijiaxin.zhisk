import {ChevronDown, Plus, Settings, Wand2} from 'lucide-react';
import type {SkillItem, SkillViewMode} from '../types';
import {SkillPagination} from './SkillPagination';
import {EmptyState, SkillSearchInput, SkillViewSwitch} from './SkillPrimitives';

interface SkillLibraryViewProps {
  skills: SkillItem[];
  search: string;
  viewMode: SkillViewMode;
  onSearchChange: (value: string) => void;
  onViewModeChange: (value: SkillViewMode) => void;
  onCreate: () => void;
  onManage: () => void;
  onOpenDetail: (skill: SkillItem) => void;
  onUse: (skill: SkillItem) => void;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
}

function SkillCard({
  skill,
  onOpenDetail,
  onUse,
}: {
  skill: SkillItem;
  onOpenDetail: (skill: SkillItem) => void;
  onUse: (skill: SkillItem) => void;
}) {
  return (
    <article
      onClick={() => onOpenDetail(skill)}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xl">{skill.icon}</div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900">{skill.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {skill.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-600">{skill.description}</p>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-sm">
        <div>
          <div className="text-xs text-slate-400">开发人</div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">{skill.creatorName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">添加次数</div>
          <div className="mt-0.5 font-semibold text-slate-900">{skill.addCount}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">版本</div>
          <div className="mt-0.5 font-semibold text-slate-900">{skill.latestVersion}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="truncate text-xs text-slate-400">更新于 {skill.updatedAt}</div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onUse(skill);
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition-all hover:bg-blue-700"
        >
          <Wand2 className="h-3.5 w-3.5" />
          使用
        </button>
      </div>
    </article>
  );
}

function SkillList({
  skills,
  onOpenDetail,
  onUse,
}: {
  skills: SkillItem[];
  onOpenDetail: (skill: SkillItem) => void;
  onUse: (skill: SkillItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[1040px]">
        <div className="grid grid-cols-[minmax(260px,1.4fr)_170px_90px_110px_110px_150px_80px] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
          <div>Skill 名称</div>
          <div>标签</div>
          <div>版本号</div>
          <div>开发人</div>
          <div>添加次数</div>
          <div>更新时间</div>
          <div className="text-right">操作</div>
        </div>
        <div className="divide-y divide-slate-100">
        {skills.map((skill) => (
          <div
            key={skill.id}
            onClick={() => onOpenDetail(skill)}
            className="grid cursor-pointer grid-cols-[minmax(260px,1.4fr)_170px_90px_110px_110px_150px_80px] items-center gap-4 px-4 py-4 text-sm hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg">{skill.icon}</div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{skill.name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{skill.description}</div>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {skill.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
            <div className="font-medium text-slate-600">{skill.latestVersion}</div>
            <div className="truncate font-medium text-slate-600">{skill.creatorName}</div>
            <div className="text-slate-600">{skill.addCount}</div>
            <div className="text-slate-500">{skill.updatedAt}</div>
            <div className="text-right">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUse(skill);
                }}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                使用
              </button>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

export function SkillLibraryView({
  skills,
  search,
  viewMode,
  onSearchChange,
  onViewModeChange,
  onCreate,
  onManage,
  onOpenDetail,
  onUse,
  pagination,
}: SkillLibraryViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Skill 模板库</h2>
          <p className="mt-1 text-sm text-slate-500">展示当前可使用的 Skill，点击卡片可查看详情并使用。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SkillSearchInput value={search} onChange={onSearchChange} />
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600"
          >
            全部
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          <SkillViewSwitch value={viewMode} onChange={onViewModeChange} />
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建 Skill
          </button>
          <button
            type="button"
            onClick={onManage}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-all hover:border-blue-200 hover:text-blue-600"
          >
            <Settings className="h-4 w-4" />
            管理技能
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <EmptyState title="暂无可展示的 Skill" description="当前没有可使用或匹配搜索条件的 Skill。" />
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onOpenDetail={onOpenDetail} onUse={onUse} />
          ))}
        </div>
      ) : (
        <SkillList skills={skills} onOpenDetail={onOpenDetail} onUse={onUse} />
      )}

      <SkillPagination {...pagination} />
    </div>
  );
}
