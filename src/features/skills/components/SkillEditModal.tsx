import {Camera, ChevronDown, X} from 'lucide-react';
import type {SkillEditForm} from '../types';

interface SkillEditModalProps {
  open: boolean;
  title: string;
  form: SkillEditForm;
  errors: Partial<Record<keyof SkillEditForm, string>>;
  onChange: (form: SkillEditForm) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </div>
      {children}
      {error && <div className="mt-1.5 text-xs font-medium text-red-500">{error}</div>}
    </label>
  );
}

export function SkillEditModal({open, title, form, errors, onChange, onCancel, onConfirm}: SkillEditModalProps) {
  if (!open) return null;

  const inputClass = (field: keyof SkillEditForm) =>
    `h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-800 outline-none transition-all ${
      errors[field] ? 'border-red-300 ring-2 ring-red-500/10' : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
    }`;

  const textareaClass = (field: keyof SkillEditForm) =>
    `w-full resize-none rounded-md border bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition-all ${
      errors[field] ? 'border-red-300 ring-2 ring-red-500/10' : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
    }`;

  const addTag = () => {
    const next = form.tagInput.trim();
    if (!next || form.tags.includes(next)) {
      onChange({...form, tagInput: ''});
      return;
    }
    onChange({...form, tags: [...form.tags, next], tagInput: ''});
  };

  const removeTag = (tag: string) => {
    onChange({...form, tags: form.tags.filter((item) => item !== tag)});
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 px-5 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[540px] flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl shadow-slate-950/25">
        <div className="flex items-center justify-between px-6 py-5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <Field label="展示名称" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => onChange({...form, name: event.target.value})}
              className={inputClass('name')}
            />
          </Field>

          <Field label="描述" error={errors.description}>
            <textarea
              value={form.description}
              onChange={(event) => onChange({...form, description: event.target.value})}
              className={`${textareaClass('description')} min-h-[78px]`}
            />
          </Field>

          <Field label="图标" error={errors.icon}>
            <div className="relative inline-flex">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-2xl text-white">
                {form.icon || '✨'}
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-100 text-slate-500 shadow-sm">
                <Camera className="h-3 w-3" />
              </div>
            </div>
            <input
              value={form.icon}
              onChange={(event) => onChange({...form, icon: event.target.value})}
              className="mt-2 h-9 w-28 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>

          <Field label="标签">
            <div className="flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-slate-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={form.tagInput}
                  onChange={(event) => onChange({...form, tagInput: event.target.value})}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={form.tags.length === 0 ? '输入标签后回车' : ''}
                  className="min-w-24 flex-1 border-none bg-transparent text-sm text-slate-700 outline-none"
                />
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </Field>

          <Field label="技能版本号" required error={errors.version}>
            <input
              value={form.version}
              onChange={(event) => onChange({...form, version: event.target.value})}
              placeholder="例如：V1.0.2"
              className={inputClass('version')}
            />
          </Field>

          <Field label="更新日志" error={errors.releaseNotes}>
            <textarea
              value={form.releaseNotes}
              onChange={(event) => onChange({...form, releaseNotes: event.target.value})}
              placeholder="一行一条更新内容"
              className={`${textareaClass('releaseNotes')} min-h-[76px]`}
            />
          </Field>
        </div>

        <div className="flex justify-end px-6 pb-6">
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-lg bg-slate-950 px-6 text-sm font-semibold text-white transition-all hover:bg-slate-800"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
