import {Grid2X2, List, Search} from 'lucide-react';
import type {SkillViewMode} from '../types';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SkillSearchInput({value, onChange, placeholder = '搜索名称、描述、创建人'}: SearchInputProps) {
  return (
    <div className="relative min-w-[260px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
      />
    </div>
  );
}

interface ViewSwitchProps {
  value: SkillViewMode;
  onChange: (value: SkillViewMode) => void;
}

export function SkillViewSwitch({value, onChange}: ViewSwitchProps) {
  const items = [
    {value: 'card' as const, label: '卡片', icon: Grid2X2},
    {value: 'list' as const, label: '列表', icon: List},
  ];

  return (
    <div className="inline-flex h-10 rounded-lg border border-slate-200 bg-white p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all ${
              active ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({title, description}: {title: string; description: string}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-xl">✨</div>
        <div className="mt-4 text-sm font-semibold text-slate-700">{title}</div>
        <div className="mt-1 text-xs text-slate-400">{description}</div>
      </div>
    </div>
  );
}
