"use client";

import { useEffect, useState } from "react";
import { fetchCollection } from "@/lib/api";
import type { ApiRecord } from "@/lib/types";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";

type ResourcePageProps = {
  title: string;
  description: string;
  endpoint: string;
  preferredKeys?: string[];
};

export function ResourcePage({
  title,
  description,
  endpoint,
  preferredKeys,
}: ResourcePageProps) {
  const [rows, setRows] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchCollection<ApiRecord>(endpoint);
        setRows(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load resource.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [endpoint]);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      {loading ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white px-5 py-10 text-sm text-slate-500 shadow-[var(--shadow-soft)]">
          Loading {title.toLowerCase()}...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <DataTable
          title={`${title} List`}
          description="Live data coming from the Laravel API."
          rows={rows}
          preferredKeys={preferredKeys}
        />
      )}
    </div>
  );
}
