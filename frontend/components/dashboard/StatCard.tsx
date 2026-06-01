interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "violet" | "slate";
}

const COLORS = {
  blue: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
  green: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  violet: "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
  slate: "border-slate-400 bg-slate-50 dark:bg-slate-800/50",
};

export default function StatCard({ label, value, sub, color = "slate" }: StatCardProps) {
  return (
    <div className={`rounded-xl border-l-4 p-5 shadow-sm bg-white dark:bg-slate-900 ${COLORS[color]}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
