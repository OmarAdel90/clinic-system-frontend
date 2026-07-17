"use client";

import { useLocale } from "@/components/locale-provider";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
}: PaginationControlsProps) {
  const { t } = useLocale();

  if (totalItems <= pageSize) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line)] pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {t("Showing")} {start}-{end} {t("of")} {totalItems} {t(itemLabel)}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("Previous")}
        </button>
        <div className="min-w-[88px] text-center text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          {t("Page")} {page} / {totalPages}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("Next")}
        </button>
      </div>
    </div>
  );
}
