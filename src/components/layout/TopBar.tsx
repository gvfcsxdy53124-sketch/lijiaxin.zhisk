import {Bell, Search, Settings} from 'lucide-react';
import {useLocation} from 'react-router-dom';

const titleByPath: Record<string, string> = {
  '/knowledge': '知识库管理',
  '/skills': '技能编排',
  '/permissions': '权限管理',
};

export function TopBar() {
  const location = useLocation();
  const pageTitle = titleByPath[location.pathname] ?? '企业知识中台';

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Workspace</p>
        <h2 className="text-base font-semibold text-slate-950">{pageTitle}</h2>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden w-80 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="搜索知识库、技能、成员"
            type="search"
          />
        </div>
        <button className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" type="button" aria-label="通知">
          <Bell className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" type="button" aria-label="设置">
          <Settings className="h-4 w-4" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
          C
        </div>
      </div>
    </header>
  );
}
