"use client";

import { useLocale } from "@/components/locale-provider";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          {t("Workspace")}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{t(title)}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t(description)}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
