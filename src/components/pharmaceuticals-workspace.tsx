"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Pharmaceutical } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";
import { PaginationControls } from "@/components/pagination-controls";

type AttributeRow = {
  key: string;
  value: string;
};

type PharmaceuticalForm = {
  SKU: string;
  name: string;
  arabic_name: string;
  sale_price: string;
  description: string;
  attribute: string;
};

const initialForm: PharmaceuticalForm = {
  SKU: "",
  name: "",
  arabic_name: "",
  sale_price: "",
  description: "",
  attribute: "",
};

const initialAttributeRow: AttributeRow = {
  key: "",
  value: "",
};
const PHARMACEUTICALS_PAGE_SIZE = 12;

function toForm(item?: Pharmaceutical | null): PharmaceuticalForm {
  if (!item) {
    return initialForm;
  }

    return {
      SKU: item.SKU || "",
      name: item.name || "",
      arabic_name: item.arabic_name || "",
      sale_price: item.sale_price != null ? String(item.sale_price) : "",
      description: item.description || "",
      attribute:
        item.attribute && typeof item.attribute === "object" && !Array.isArray(item.attribute)
          ? Object.entries(item.attribute as Record<string, unknown>)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join("\n")
          : "",
  };
}

function parseAttribute(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = lines.map((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error('Attributes must be written as "key: value" on separate lines.');
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key || !rawValue) {
      throw new Error('Attributes must be written as "key: value" on separate lines.');
    }

    return [key, rawValue];
  });

  return Object.fromEntries(entries);
}

function attributeRowsFromString(value: string): AttributeRow[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [initialAttributeRow];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        return {
          key: line,
          value: "",
        };
      }

      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

function attributeStringFromRows(rows: AttributeRow[]) {
  return rows
    .map((row) => ({
      key: row.key.trim(),
      value: row.value.trim(),
    }))
    .filter((row) => row.key && row.value)
    .map((row) => `${row.key}: ${row.value}`)
    .join("\n");
}

export function PharmaceuticalsWorkspace() {
  const [items, setItems] = useState<Pharmaceutical[]>([]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<PharmaceuticalForm>(initialForm);
  const [editForm, setEditForm] = useState<PharmaceuticalForm>(initialForm);
  const [createAttributeRows, setCreateAttributeRows] = useState<AttributeRow[]>([initialAttributeRow]);
  const [editAttributeRows, setEditAttributeRows] = useState<AttributeRow[]>([initialAttributeRow]);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingSku, setDeletingSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [itemPage, setItemPage] = useState(1);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      if (!term) {
        return true;
      }

      return [item.SKU, item.name, item.arabic_name, item.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [items, search]);

  const itemTotalPages = Math.max(1, Math.ceil(filteredItems.length / PHARMACEUTICALS_PAGE_SIZE));
  const paginatedItems = useMemo(
    () => filteredItems.slice((itemPage - 1) * PHARMACEUTICALS_PAGE_SIZE, itemPage * PHARMACEUTICALS_PAGE_SIZE),
    [filteredItems, itemPage],
  );

  const selectedItem = useMemo(() => items.find((item) => item.SKU === selectedSku) ?? null, [items, selectedSku]);

  const stats = useMemo(
    () => ({
      total: items.length,
      priced: items.filter((item) => Number(item.sale_price || 0) > 0).length,
      withArabic: items.filter((item) => Boolean(item.arabic_name)).length,
      withAttributes: items.filter((item) => Boolean(item.attribute)).length,
    }),
    [items],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCollection<Pharmaceutical>("/pharmaceuticals");
      setItems(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load pharmaceuticals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  useEffect(() => {
    const nextForm = toForm(selectedItem);
    setEditForm(nextForm);
    setEditAttributeRows(attributeRowsFromString(nextForm.attribute));
  }, [selectedItem]);

  useEffect(() => {
    setItemPage(1);
  }, [search]);

  useEffect(() => {
    if (itemPage > itemTotalPages) {
      setItemPage(itemTotalPages);
    }
  }, [itemPage, itemTotalPages]);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/pharmaceuticals", "POST", {
        SKU: createForm.SKU,
        name: createForm.name,
        arabic_name: createForm.arabic_name || null,
        sale_price: Number(createForm.sale_price || 0),
        description: createForm.description || null,
        attribute: parseAttribute(createForm.attribute),
      });
      setCreateForm(initialForm);
      setCreateAttributeRows([initialAttributeRow]);
      setNotice("Pharmaceutical created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create pharmaceutical.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/pharmaceuticals/${selectedItem.SKU}`, "PATCH", {
        SKU: editForm.SKU,
        name: editForm.name,
        arabic_name: editForm.arabic_name || null,
        sale_price: Number(editForm.sale_price || 0),
        description: editForm.description || null,
        attribute: parseAttribute(editForm.attribute),
      });
      setDetailsNotice(`Pharmaceutical "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update pharmaceutical.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(sku: string) {
    setDeletingSku(sku);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/pharmaceuticals/${sku}`);
      setDetailsNotice(`Pharmaceutical ${sku} deleted successfully.`);
      if (selectedSku === sku) {
        setSelectedSku(null);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete pharmaceutical.");
    } finally {
      setDeletingSku(null);
    }
  }

  function openItemDetails(sku: string) {
    setSelectedSku(sku);
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  function renderAttributeEditor(
    form: PharmaceuticalForm,
    setForm: (updater: (current: PharmaceuticalForm) => PharmaceuticalForm) => void,
    rows: AttributeRow[],
    setRows: (updater: (current: AttributeRow[]) => AttributeRow[]) => void,
    prefix: string,
  ) {
    function syncRows(nextRows: AttributeRow[]) {
      const normalizedRows = nextRows.length ? nextRows : [initialAttributeRow];
      setRows(() => normalizedRows);
      setForm((current) => ({
        ...current,
        attribute: attributeStringFromRows(normalizedRows),
      }));
    }

    function updateRow(index: number, field: keyof AttributeRow, value: string) {
      syncRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
    }

    function addRow() {
      syncRows([...rows, initialAttributeRow]);
    }

    function removeRow(index: number) {
      const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
      syncRows(nextRows.length ? nextRows : [initialAttributeRow]);
    }

    return (
      <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">Attributes</div>
            <div className="text-xs text-slate-500">Add structured properties like dose, form, or pack size.</div>
          </div>
          <button type="button" onClick={addRow} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
            Add Attribute
          </button>
        </div>

        {rows.map((row, index) => (
          <div key={`${prefix}-attribute-${index}`} className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
            <WorkflowInput
              label="Name"
              name={`${prefix}-attribute-key-${index}`}
              value={row.key}
              onChange={(value) => updateRow(index, "key", value)}
              placeholder="dose"
            />
            <WorkflowInput
              label="Value"
              name={`${prefix}-attribute-value-${index}`}
              value={row.value}
              onChange={(value) => updateRow(index, "value", value)}
              placeholder="500mg"
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmaceuticals"
        description="Maintain the medication catalog used by stock intake, reservations, and clinical supply tracking."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Items" value={stats.total} hint="Pharmaceutical records returned by the API." />
        <StatCard label="Priced" value={stats.priced} hint="Items carrying a sale price." />
        <StatCard label="With Arabic Name" value={stats.withArabic} hint="Items that have localized naming." />
        <StatCard label="With Attributes" value={stats.withAttributes} hint="Items carrying structured attribute metadata." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Catalog" description="Search the catalog, then open a focused popup to review or edit a medication record.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="pharma-search" value={search} onChange={setSearch} placeholder="SKU, name, Arabic name, or description" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading pharmaceuticals...</div>
          ) : (
            <div className="space-y-3">
              {paginatedItems.map((item) => {
                const active = selectedItem?.SKU === item.SKU;
                return (
                  <button
                    key={item.SKU}
                    type="button"
                    onClick={() => openItemDetails(item.SKU)}
                    className={`w-full rounded-lg border p-4 text-left transition ${active ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{item.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{item.arabic_name || item.SKU}</div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {item.SKU}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Price: {item.sale_price ?? 0}
                    </div>
                  </button>
                );
              })}
              <PaginationControls page={itemPage} totalPages={itemTotalPages} totalItems={filteredItems.length} pageSize={PHARMACEUTICALS_PAGE_SIZE} itemLabel="pharmaceuticals" onPageChange={setItemPage} />
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Pharmaceutical" description="Add a catalog item with SKU, pricing, and optional localized or structured metadata.">
            <form className="space-y-4" onSubmit={createItem}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="SKU" name="create-pharma-sku" value={createForm.SKU} onChange={(value) => setCreateForm((current) => ({ ...current, SKU: value }))} required />
                <WorkflowInput label="Name" name="create-pharma-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
              <WorkflowInput label="Arabic Name" name="create-pharma-arabic-name" value={createForm.arabic_name} onChange={(value) => setCreateForm((current) => ({ ...current, arabic_name: value }))} />
              <WorkflowInput label="Sale Price" name="create-pharma-price" type="number" value={createForm.sale_price} onChange={(value) => setCreateForm((current) => ({ ...current, sale_price: value }))} required />
            </div>
            <WorkflowTextarea label="Description" value={createForm.description} onChange={(value) => setCreateForm((current) => ({ ...current, description: value }))} />
              {renderAttributeEditor(createForm, setCreateForm, createAttributeRows, setCreateAttributeRows, "create-pharma")}
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Pharmaceutical"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedItem.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedItem.SKU}</div>
                <div className="mt-2 text-xs text-slate-500">Updated {formatLocalDateTime(selectedItem.updated_at)}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="SKU" value={selectedItem.SKU} hint="Catalog SKU." />
                <StatCard label="Price" value={selectedItem.sale_price ?? 0} hint="Configured sale price." />
                <StatCard label="Arabic Name" value={selectedItem.arabic_name || "-"} hint="Localized display name." />
                <StatCard label="Attributes" value={selectedItem.attribute ? Object.keys((selectedItem.attribute as Record<string, unknown>) || {}).length : 0} hint="Structured metadata entries." />
              </div>

              <div className="mt-5">
                <Panel title="Pharmaceutical Details" description="Update SKU metadata, pricing, and descriptive fields without leaving the catalog view.">
                  <form className="space-y-4" onSubmit={updateItem}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowInput label="SKU" name="edit-pharma-sku" value={editForm.SKU} onChange={(value) => setEditForm((current) => ({ ...current, SKU: value }))} required />
                      <WorkflowInput label="Name" name="edit-pharma-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                      <WorkflowInput label="Arabic Name" name="edit-pharma-arabic-name" value={editForm.arabic_name} onChange={(value) => setEditForm((current) => ({ ...current, arabic_name: value }))} />
                      <WorkflowInput label="Sale Price" name="edit-pharma-price" type="number" value={editForm.sale_price} onChange={(value) => setEditForm((current) => ({ ...current, sale_price: value }))} required />
                    </div>
                    <WorkflowTextarea label="Description" value={editForm.description} onChange={(value) => setEditForm((current) => ({ ...current, description: value }))} />
                    {renderAttributeEditor(editForm, setEditForm, editAttributeRows, setEditAttributeRows, "edit-pharma")}
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteItem(selectedItem.SKU)} disabled={deletingSku === selectedItem.SKU} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingSku === selectedItem.SKU ? "Deleting..." : "Delete Pharmaceutical"}
                      </button>
                    </div>
                  </form>
                </Panel>

                <Panel title="Current Attributes" description="Structured metadata currently stored on this catalog item.">
                  {selectedItem.attribute && typeof selectedItem.attribute === "object" && !Array.isArray(selectedItem.attribute) ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedItem.attribute as Record<string, unknown>).map(([key, value]) => (
                        <span key={key} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
                          <span className="font-medium text-slate-900">{key}:</span> {String(value)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No attributes configured for this pharmaceutical.</div>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
