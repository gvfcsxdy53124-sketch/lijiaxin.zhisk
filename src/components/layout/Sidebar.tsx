import {BookOpen, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sparkles} from 'lucide-react';
import {NavLink} from 'react-router-dom';
import {useAppStore} from '@/stores/app.store';

const navItems = [
  {to: '/knowledge', label: '知识库', icon: BookOpen},
  {to: '/skills', label: '技能编排', icon: Sparkles},
  {to: '/permissions', label: '权限管理', icon: ShieldCheck},
];

export function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  return (
    <aside className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-5">
        {!sidebarCollapsed && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">UniAction</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-950">企业知识中台</h1>
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({isActive}) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                } ${sidebarCollapsed ? 'justify-center' : ''}`
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && item.label}
            </NavLink>
          );
        })}
      </nav>
      {!sidebarCollapsed && (
        <div className="border-t border-slate-200 p-4 text-xs leading-5 text-slate-500">
          React Router + Zustand ready
        </div>
      )}
    </aside>
  );
}
