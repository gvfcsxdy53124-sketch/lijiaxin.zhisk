import {ChevronLeft, Download, Edit, FileUp, MoreHorizontal, Plus, Trash2} from 'lucide-react';
import {useState} from 'react';
import type {SkillItem, SkillManageTab} from '../types';
import {SkillPagination} from './SkillPagination';
import {EmptyState, SkillSearchInput} from './SkillPrimitives';

interface SkillManageViewProps {
  createdSkills: SkillItem[];
  addedSkills: SkillItem[];
  activeTab: SkillManageTab;
  search: string;
  onBack: () => void;
  onTabChange: (tab: SkillManageTab) => void;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onEdit: (skill: SkillItem) => void;
  onUpdateFile: (skill: SkillItem) => void;
  onDownload: (skill: SkillItem) => void;
  onRemove: (skill: SkillItem) => void;
  onOpenDetail: (skill: SkillItem) => void;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
}

export function SkillManageView({
  createdSkills,
  addedSkills,
  activeTab,
  search,
  onBack,
  onTabChange,
  onSearchChange,
  onCreate,
  onEdit,
  onUpdateFile,
  onDownload,
  onRemove,
  onOpenDetail,
  pagination,
}: SkillManageViewProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const skills = activeTab === 'created' ? createdSkills : addedSkills;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-all hover:text-blue-600"
        >
          <ChevronLeft className="h-4 w-4" />
          返回模板库
        </button>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">管理技能</h2>
            <p className="mt-1 text-sm text-slate-500">上传、编辑和管理 Skill 生命周期。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SkillSearchInput value={search} onChange={onSearchChange} />
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              新建 Skill
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onTabChange('added')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'added' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            我添加的
          </button>
          <button
            type="button"
            onClick={() => onTabChange('created')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'created' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            我创建的
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <EmptyState title="暂无 Skill" description={activeTab === 'created' ? '你还没有上传创建 Skill，可以点击新建 Skill。' : '当前没有可使用的 Skill。'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {skills.map((skill) => (
            <article
              key={skill.id}
              onClick={() => onOpenDetail(skill)}
              className="relative cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">{skill.icon}</div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900">{skill.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">最新版本 {skill.latestVersion}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId(openMenuId === skill.id ? null : skill.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-4 line-clamp-2 min-h-[48px] text-sm leading-6 text-slate-600">{skill.description}</p>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                <span>更新时间 {skill.updatedAt}</span>
                <span>{skill.addCount} 次添加</span>
              </div>

              {openMenuId === skill.id && (
                <div
                  onClick={(event) => event.stopPropagation()}
                  className="absolute right-4 top-14 z-10 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {activeTab === 'created' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onEdit(skill);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onUpdateFile(skill);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600"
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        更新 Skill 文件
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onDownload(skill);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600"
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onRemove(skill);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition-all hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        onRemove(skill);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition-all hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      移除
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <SkillPagination {...pagination} />
    </div>
  );
}
