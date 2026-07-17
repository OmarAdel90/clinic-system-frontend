"use client";

import { useLocale } from "@/components/locale-provider";

type WorkflowTextareaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function WorkflowTextarea({
  label,
  value,
  onChange,
  placeholder,
}: WorkflowTextareaProps) {
  const { t } = useLocale();

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{t(label)}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t(placeholder)}
        rows={4}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  );
}
