"use client";

import { useEffect, useMemo, useState } from "react";

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
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption?.label, value]);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const searchable = allowEmpty
      ? [{ label: emptyLabel, value: "" }, ...options]
      : options;

    return searchable.filter((option) => {
      if (!term) {
        return true;
      }

      return option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term);
    });
  }, [allowEmpty, emptyLabel, options, query]);

  function selectOption(option: WorkflowSelectOption) {
    setQuery(option.value ? option.label : "");
    onChange(option.value);
    setOpen(false);
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
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
                option.value.toLowerCase() === nextValue.trim().toLowerCase(),
            );

            if (exact) {
              onChange(exact.value);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!value) {
                setQuery("");
                return;
              }

              const selected = options.find((option) => option.value === value);
              if (selected) {
                setQuery(selected.label);
              }
            }, 120);
          }}
          placeholder={allowEmpty ? emptyLabel : "Search"}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-slate-400"
        />
        {open ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${option.value || "empty"}-${option.label}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50"
                >
                  <div className="break-words leading-5">{option.label}</div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">No matches found.</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
