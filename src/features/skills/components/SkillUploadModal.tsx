import {FileArchive, Upload, X} from 'lucide-react';

interface SkillUploadModalProps {
  open: boolean;
  title?: string;
  fileName: string;
  onFileNameChange: (value: string) => void;
  onClose: () => void;
  onParse: () => void;
}

export function SkillUploadModal({open, title = '上传技能', fileName, onFileNameChange, onClose, onParse}: SkillUploadModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-5 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 transition-all hover:border-blue-300 hover:bg-blue-50/40">
          <input
            type="file"
            accept=".zip,.skill"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileNameChange(file.name);
            }}
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
            <FileArchive className="h-7 w-7" />
          </div>
          <div className="mt-5 text-sm font-medium text-slate-700">拖拽文件至此，或点击选择文件</div>
          {fileName && <div className="mt-2 rounded-md bg-white px-3 py-1 text-xs font-medium text-blue-600">{fileName}</div>}
        </label>

        <div className="mt-4 space-y-1.5 text-xs leading-5 text-slate-500">
          <div>· 仅支持上传包含 SKILL.md文件的 .zip或 .skill格式压缩包</div>
          <div>· SKILL.md 应包含以 YAML 格式编写的技能名称和描述</div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onParse}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            确认上传
          </button>
        </div>
      </div>
    </div>
  );
}
