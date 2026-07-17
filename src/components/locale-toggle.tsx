"use client";

import { useLocale } from "@/components/locale-provider";

type LocaleToggleProps = {
  compact?: boolean;
};

export function LocaleToggle({ compact = false }: LocaleToggleProps) {
  const { locale, toggleLocale } = useLocale();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`rounded-xl border border-[var(--line)] bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50 ${
        compact ? "px-3 py-2" : "px-4 py-2.5"
      }`}
    >
      {locale === "en" ? "العربية" : "English"}
    </button>
  );
}
