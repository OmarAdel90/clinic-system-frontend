type SelectOption = {
  label: string;
  value: string | number;
};

type WorkflowSelectProps = {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  required?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
};

export function WorkflowSelect({
  label,
  value,
  onChange,
  options,
  required,
  emptyLabel,
  allowEmpty = true,
}: WorkflowSelectProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      >
        {allowEmpty ? (
          <option value="">{emptyLabel ?? (required ? "Select..." : "None")}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
