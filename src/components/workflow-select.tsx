"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";

type WorkflowSelectOption = {
  label: string;
  value: string;
};

type WorkflowSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: WorkflowSelectOption[];
  required?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
};

export function WorkflowSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  emptyLabel = "Select an option",
  allowEmpty = true,
}: WorkflowSelectProps) {
  const { isRTL, t } = useLocale();
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selectedOption ? t(selectedOption.label) : "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption ? t(selectedOption.label) : "");
  }, [selectedOption, t, value]);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const searchable = allowEmpty
      ? [{ label: t(emptyLabel), value: "" }, ...options]
      : options;

    return searchable.filter((option) => {
      if (!term) {
        return true;
      }

      const translatedLabel = t(option.label).toLowerCase();

      return (
        option.label.toLowerCase().includes(term) ||
        translatedLabel.includes(term) ||
        option.value.toLowerCase().includes(term)
      );
    });
  }, [allowEmpty, emptyLabel, options, query, t]);

  function selectOption(option: WorkflowSelectOption) {
    setQuery(option.value ? t(option.label) : "");
    onChange(option.value);
    setOpen(false);
  }

  function openDropdown(resetQuery = false) {
    if (resetQuery) {
      setQuery("");
    }
    setOpen(true);
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{t(label)}</span>
      <div className="relative">
        <input
          value={query}
          required={required}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setOpen(true);

            if (!nextValue.trim() && allowEmpty) {
              onChange("");
            }

            const exact = options.find(
              (option) =>
                option.label.toLowerCase() === nextValue.trim().toLowerCase() ||
                t(option.label).toLowerCase() === nextValue.trim().toLowerCase() ||
                option.value.toLowerCase() === nextValue.trim().toLowerCase(),
            );

            if (exact) {
              onChange(exact.value);
            }
          }}
          onFocus={() => {
            openDropdown(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!value) {
                setQuery("");
                return;
              }

              const selected = options.find((option) => option.value === value);
              if (selected) {
                setQuery(t(selected.label));
              }
            }, 120);
          }}
          placeholder={t(allowEmpty ? emptyLabel : "Search")}
          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-slate-400 ${
            isRTL ? "pl-10 text-right" : "pr-10"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${t("Search")} ${t(label)}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openDropdown(true)}
          className={`absolute inset-y-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600 ${
            isRTL ? "left-0" : "right-0"
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${option.value || "empty"}-${option.label}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50 ${isRTL ? "text-right" : "text-left"}`}
                >
                  <div className="break-words leading-5">{t(option.label)}</div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">{t("No matches found.")}</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
