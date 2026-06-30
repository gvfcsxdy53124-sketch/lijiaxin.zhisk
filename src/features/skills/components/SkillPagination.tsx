import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';

interface SkillPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function SkillPagination({total, page, pageSize, onPageChange, onPageSizeChange}: SkillPaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="flex items-center justify-end rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="inline-flex items-center gap-2.5">
        <span className="text-sm font-medium text-slate-600">共 {total} 条</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
        >
          <ChevronLeft className="h-4 w-4 text-slate-600" />
        </button>
        <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-900">
          {safePage}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
        >
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
        <div className="relative">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          >
            <option value={6}>6 条/页</option>
            <option value={12}>12 条/页</option>
            <option value={24}>24 条/页</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>
    </div>
  );
}
