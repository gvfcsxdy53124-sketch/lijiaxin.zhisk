import {useState} from 'react';
import {Copy, GitBranch, Plus, X} from 'lucide-react';
import type {SkillDetailTab, SkillItem} from '../types';
import {formatAddCount} from '../utils/skillRules';

interface SkillDetailModalProps {
  skill: SkillItem | null;
  onClose: () => void;
  onUse: (skill: SkillItem) => void;
}

const tabs: Array<{key: SkillDetailTab; label: string}> = [
  {key: 'intro', label: '技能介绍'},
  {key: 'versions', label: '版本记录'},
];

export function SkillDetailModal({skill, onClose, onUse}: SkillDetailModalProps) {
  const [activeTab, setActiveTab] = useState<SkillDetailTab>('intro');
  const [selectedVersion, setSelectedVersion] = useState(0);

  if (!skill) return null;

  const copyPrompt = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-6 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/25">
        <div className="relative border-b border-slate-100 px-8 py-7">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-start gap-5 pr-12">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-3xl text-white shadow-sm">
              {skill.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-950">{skill.name}</h2>
                {skill.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{tag}</span>
                ))}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{skill.description}</p>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-4 divide-x divide-slate-200 rounded-xl bg-slate-50 px-4 py-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                <img src={skill.creatorAvatar} alt={skill.creatorName} className="h-6 w-6 rounded-full" />
                {skill.creatorName}
              </div>
              <div className="mt-1 text-xs text-slate-400">开发人</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-700">{formatAddCount(skill.addCount)} 次添加</div>
              <div className="mt-1 text-xs text-slate-400">添加次数</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-700">{skill.updatedAt}</div>
              <div className="mt-1 text-xs text-slate-400">更新时间</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-700">{skill.latestVersion}</div>
              <div className="mt-1 text-xs text-slate-400">最新版本</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="flex items-center gap-8 border-b border-slate-100">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative pb-3 text-sm font-semibold transition-all ${
                  activeTab === tab.key ? 'text-slate-950' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-slate-950" />}
              </button>
            ))}
          </div>

          {activeTab === 'intro' && (
            <div className="space-y-6 pt-6">
              <div className="grid gap-4 lg:grid-cols-3">
                {skill.introduction.coreFeatures.map((feature, index) => (
                  <div key={feature.title} className="rounded-xl bg-slate-50 p-5">
                    <div className="text-2xl">{['🔍', '🦉', '💬'][index] || '✨'}</div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">{feature.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">适用场景</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skill.introduction.scenarios.map((item) => (
                    <span key={item} className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">{item}</span>
                  ))}
                </div>
              </section>

              <section className="rounded-xl bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-900">Prompt 逻辑</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{skill.introduction.promptLogic}</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">示例提示词</h3>
                <div className="mt-3 overflow-hidden rounded-xl bg-slate-50">
                  {skill.introduction.examples.map((example, index) => (
                    <div key={example.title} className={`px-5 py-4 ${index > 0 ? 'border-t border-slate-200' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{example.title}</div>
                        <button
                          type="button"
                          onClick={() => copyPrompt(example.content)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-white hover:text-blue-600"
                          title="复制提示词"
                          aria-label={`复制${example.title}提示词`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{example.content}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="grid gap-5 pt-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2">
                {skill.versions.map((version, index) => (
                  <button
                    key={version.version}
                    type="button"
                    onClick={() => setSelectedVersion(index)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                      selectedVersion === index ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{version.version}</div>
                    <div className="mt-1 text-xs text-slate-400">{version.date}</div>
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <GitBranch className="h-4 w-4 text-blue-600" />
                  {skill.versions[selectedVersion]?.version} 更新日志
                </div>
                <ul className="mt-4 space-y-3">
                  {skill.versions[selectedVersion]?.notes.map((note) => (
                    <li key={note} className="flex gap-3 text-sm leading-6 text-slate-600">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-white px-8 py-5">
          <button
            type="button"
            onClick={() => onUse(skill)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            使用
          </button>
        </div>
      </div>
    </div>
  );
}
