"use client";

import { useLocale } from "@/components/locale-provider";

type PanelProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export function Panel({ title, description, children, actions }: PanelProps) {
  const { t } = useLocale();

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{t(title)}</h3>
          {description ? <p className="mt-1 text-sm text-slate-600">{t(description)}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
