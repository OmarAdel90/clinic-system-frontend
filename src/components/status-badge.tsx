type StatusBadgeProps = {
  value?: string | null;
};

const colorMap: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-sky-100 text-sky-700",
  qualified: "bg-amber-100 text-amber-700",
  converted: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
  scheduled: "bg-slate-100 text-slate-700",
  confirmed: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
  missed: "bg-amber-100 text-amber-700",
  unpaid: "bg-rose-100 text-rose-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value?.toLowerCase() ?? "unknown";
  const classes = colorMap[normalized] ?? "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>
      {value ?? "Unknown"}
    </span>
  );
}
