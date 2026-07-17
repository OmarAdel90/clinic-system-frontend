"use client";

import { useLocale } from "@/components/locale-provider";

type StatCardProps = {
  label: string;
  value: string | number;
  hint: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  const { t } = useLocale();

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <p className="text-sm font-medium text-slate-500">{t(label)}</p>
      <p className="mt-4 min-w-0 break-words text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm text-slate-600">{t(hint)}</p>
    </div>
  );
}
