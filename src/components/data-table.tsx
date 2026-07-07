import type { ApiRecord } from "@/lib/types";

type DataTableProps = {
  title: string;
  description: string;
  rows: ApiRecord[];
  preferredKeys?: string[];
};

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.length ? `${value.length} items` : "—";
  }

  if (typeof value === "object") {
    return "Object";
  }

  return String(value);
}

export function DataTable({
  title,
  description,
  rows,
  preferredKeys = [],
}: DataTableProps) {
  const firstRow = rows[0];
  const discoveredKeys = firstRow ? Object.keys(firstRow) : [];
  const columns = [...preferredKeys, ...discoveredKeys].filter(
    (key, index, array) => array.indexOf(key) === index,
  );

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-sm text-slate-500">No records returned from the API yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--line)]">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
                  >
                    {column.replaceAll("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((row, index) => (
                <tr key={String(row.id ?? index)} className="align-top">
                  {columns.map((column) => (
                    <td key={column} className="px-5 py-4 text-sm text-slate-700">
                      {stringifyValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
