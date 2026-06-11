import type {LucideIcon} from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend: string;
}

export function StatCard({label, value, icon: Icon, trend}: StatCardProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <strong className="text-2xl font-semibold text-slate-950">{value}</strong>
        <span className="text-xs font-medium text-emerald-600">{trend}</span>
      </div>
    </section>
  );
}
