"use client";

import { useLocale } from "@/components/locale-provider";

type WorkflowInputProps = {
  label: string;
  name: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

export function WorkflowInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: WorkflowInputProps) {
  const { t } = useLocale();

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{t(label)}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t(placeholder)}
        required={required}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  );
}
