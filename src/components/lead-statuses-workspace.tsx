"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { LeadStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatusBadge } from "@/components/status-badge";
import { formatLocalDateTime } from "@/lib/time";

type StatusForm = {
  label: string;
  key: string;
  color: string;
  is_qualified: string;
  is_active: string;
  sort_order: string;
};

const initialForm: StatusForm = {
  label: "",
  key: "",
  color: "",
  is_qualified: "false",
  is_active: "true",
  sort_order: "0",
};

function toBooleanString(value?: boolean | null, fallback = "false") {
  if (typeof value !== "boolean") {
    return fallback;
  }

  return value ? "true" : "false";
}

function toForm(row?: LeadStatus | null): StatusForm {
  if (!row) {
    return initialForm;
  }

  return {
    label: row.label,
    key: row.key || "",
    color: row.color || "",
    is_qualified: toBooleanString(row.is_qualified),
    is_active: toBooleanString(row.is_active, "true"),
    sort_order: String(row.sort_order ?? 0),
  };
}

function buildStatusPatchPayload(selectedRow: LeadStatus, editForm: StatusForm) {
  const payload: Record<string, string | number | boolean | null> = {};

  if (editForm.label !== selectedRow.label) {
    payload.label = editForm.label;
  }

  if ((editForm.key || "") !== (selectedRow.key || "")) {
    payload.key = editForm.key || null;
  }

  if ((editForm.color || "") !== (selectedRow.color || "")) {
    payload.color = editForm.color || null;
  }

  if ((editForm.is_qualified === "true") !== Boolean(selectedRow.is_qualified)) {
    payload.is_qualified = editForm.is_qualified === "true";
  }

  if ((editForm.is_active === "true") !== (selectedRow.is_active ?? true)) {
    payload.is_active = editForm.is_active === "true";
  }

  if (Number(editForm.sort_order || 0) !== (selectedRow.sort_order ?? 0)) {
    payload.sort_order = Number(editForm.sort_order || 0);
  }

  return payload;
}

export function LeadStatusesWorkspace() {
  const [rows, setRows] = useState<LeadStatus[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState<StatusForm>(initialForm);
  const [editForm, setEditForm] = useState<StatusForm>(initialForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (!term) {
        return true;
      }

      return [row.label, row.key, row.color, String(row.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, search]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCollection<LeadStatus>("/lead-statuses");
      setRows(payload);
      setSelectedId((current) => current ?? payload[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load lead statuses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  function handleSelect(row: LeadStatus) {
    setSelectedId(row.id);
    setEditForm(toForm(row));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      const created = await mutateJson<LeadStatus>("/lead-statuses", "POST", {
        label: createForm.label,
        key: createForm.key || null,
        color: createForm.color || null,
        is_qualified: createForm.is_qualified === "true",
        is_active: createForm.is_active === "true",
        sort_order: Number(createForm.sort_order || 0),
      });
      setNotice(`Status \"${created.label}\" created successfully.`);
      setCreateForm(initialForm);
      await load();
      handleSelect(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create lead status.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow) return;

    const payload = buildStatusPatchPayload(selectedRow, editForm);
    if (Object.keys(payload).length === 0) {
      setNotice("No changes to save.");
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<LeadStatus>(`/lead-statuses/${selectedRow.id}`, "PATCH", payload);
      setNotice(`Status \"${editForm.label}\" updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update lead status.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(statusId: number) {
    setDeleting(statusId);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/lead-statuses/${statusId}`);
      setNotice(`Status #${statusId} deleted successfully.`);
      if (selectedId === statusId) {
        setSelectedId(null);
        setEditForm(initialForm);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete lead status.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Statuses"
        description="Manage the dynamic CRM pipeline statuses shown across lead and agent workflows while preserving stable internal keys for automation."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Status List" description="Ordered lead statuses coming from the API.">
          <div className="mb-4">
            <WorkflowInput
              label="Search"
              name="status-search"
              value={search}
              onChange={setSearch}
              placeholder="Label, key, color, or id"
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading lead statuses...</div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => {
                const active = selectedId === row.id;

                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border p-4 transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelect(row)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: row.color || "#94a3b8" }} />
                          <div className="text-sm font-semibold">{row.label}</div>
                          <StatusBadge value={row.is_active ? "active" : "inactive"} color={row.is_active ? row.color : null} />
                        </div>
                        <div className={`mt-2 grid gap-2 text-xs md:grid-cols-2 ${active ? "text-slate-300" : "text-slate-500"}`}>
                          <div>Key: {row.key || "-"}</div>
                          <div>Order: {row.sort_order ?? 0}</div>
                          <div>Qualified: {row.is_qualified ? "Yes" : "No"}</div>
                          <div>Created: {formatLocalDateTime(row.created_at)}</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        disabled={deleting === row.id}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${active ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700" : "border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        {deleting === row.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredRows.length === 0 ? <div className="text-sm text-slate-500">No statuses match the current search.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Status" description="Add a new dynamic status for the lead pipeline.">
            <form className="space-y-4" onSubmit={handleCreate}>
              <WorkflowInput label="Label" name="label" value={createForm.label} onChange={(value) => setCreateForm((current) => ({ ...current, label: value }))} placeholder="Interested" required />
              <WorkflowInput label="Key" name="key" value={createForm.key} onChange={(value) => setCreateForm((current) => ({ ...current, key: value }))} placeholder="optional-stable-key" />
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Color" name="color" value={createForm.color} onChange={(value) => setCreateForm((current) => ({ ...current, color: value }))} placeholder="#3b82f6" />
                <WorkflowInput label="Sort Order" name="sort_order" type="number" value={createForm.sort_order} onChange={(value) => setCreateForm((current) => ({ ...current, sort_order: value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowSelect label="Qualified" value={createForm.is_qualified} onChange={(value) => setCreateForm((current) => ({ ...current, is_qualified: value }))} options={[{ label: "No", value: "false" }, { label: "Yes", value: "true" }]} />
                <WorkflowSelect label="Active" value={createForm.is_active} onChange={(value) => setCreateForm((current) => ({ ...current, is_active: value }))} options={[{ label: "Yes", value: "true" }, { label: "No", value: "false" }]} />
              </div>
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Creating..." : "Create Status"}
              </button>
            </form>
          </Panel>

          <Panel title="Edit Selected Status" description="Update the currently selected status without leaving the CRM admin flow.">
            {selectedRow ? (
              <form className="space-y-4" onSubmit={handleUpdate}>
                <WorkflowInput label="Label" name="edit-label" value={editForm.label} onChange={(value) => setEditForm((current) => ({ ...current, label: value }))} />
                <WorkflowInput label="Key" name="edit-key" value={editForm.key} onChange={(value) => setEditForm((current) => ({ ...current, key: value }))} />
                <div className="grid gap-4 md:grid-cols-2">
                  <WorkflowInput label="Color" name="edit-color" value={editForm.color} onChange={(value) => setEditForm((current) => ({ ...current, color: value }))} />
                  <WorkflowInput label="Sort Order" name="edit-sort-order" type="number" value={editForm.sort_order} onChange={(value) => setEditForm((current) => ({ ...current, sort_order: value }))} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <WorkflowSelect label="Qualified" value={editForm.is_qualified} onChange={(value) => setEditForm((current) => ({ ...current, is_qualified: value }))} options={[{ label: "No", value: "false" }, { label: "Yes", value: "true" }]} />
                  <WorkflowSelect label="Active" value={editForm.is_active} onChange={(value) => setEditForm((current) => ({ ...current, is_active: value }))} options={[{ label: "Yes", value: "true" }, { label: "No", value: "false" }]} />
                </div>
                <button type="submit" disabled={savingEdit} className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </form>
            ) : (
              <div className="text-sm text-slate-500">Select a status from the list to edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

