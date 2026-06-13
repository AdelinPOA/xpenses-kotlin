interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "violet" | "slate";
}

const COLORS = {
  blue: "border-blue-500/50 from-blue-50/60 to-sky-50/30 dark:from-blue-950/20 dark:to-slate-900/10 shadow-blue-500/5 hover:shadow-blue-500/10 hover:border-blue-500",
  green: "border-emerald-500/50 from-emerald-50/60 to-teal-50/30 dark:from-emerald-950/20 dark:to-slate-900/10 shadow-emerald-500/5 hover:shadow-emerald-500/10 hover:border-emerald-500",
  violet: "border-violet-500/50 from-violet-50/60 to-purple-50/30 dark:from-violet-950/20 dark:to-slate-900/10 shadow-violet-500/5 hover:shadow-violet-500/10 hover:border-violet-500",
  slate: "border-slate-400/50 from-slate-50/60 to-slate-100/30 dark:from-slate-800/30 dark:to-slate-900/10 shadow-slate-500/5 hover:shadow-slate-500/10 hover:border-slate-400",
};

export default function StatCard({ label, value, sub, color = "slate" }: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-l-4 p-5 backdrop-blur-md bg-white/70 dark:bg-slate-900/75 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-gradient-to-br ${COLORS[color]}`}
    >
      <div className="relative z-10">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">{value}</p>
        {sub && <p className="text-xs font-medium text-slate-400 dark:text-slate-400/70 mt-1">{sub}</p>}
      </div>
      {/* Decorative background ambient light */}
      <div className="absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-current opacity-[0.03] dark:opacity-[0.05] blur-xl pointer-events-none" />
    </div>
  );
}

