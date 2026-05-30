interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "violet" | "slate";
}

const COLORS = {
  blue: "border-blue-500 bg-blue-50",
  green: "border-emerald-500 bg-emerald-50",
  violet: "border-violet-500 bg-violet-50",
  slate: "border-slate-400 bg-slate-50",
};

export default function StatCard({ label, value, sub, color = "slate" }: StatCardProps) {
  return (
    <div className={`rounded-xl border-l-4 p-5 shadow-sm bg-white ${COLORS[color]}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
