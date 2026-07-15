"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type {
  Pharmaceutical,
  Supplier,
  SupplierPaymentEvent,
  SupplierPaymentHistory,
  Warehouse,
  WarehouseSupplierTransaction,
} from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatCard } from "@/components/stat-card";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";

type SupplierForm = {
  name: string;
  phone_number: string;
};

type TransactionItemForm = {
  sku: string;
  name: string;
  arabic_name: string;
  quantity: string;
  price: string;
};

type TransactionForm = {
  warehouse_id: string;
  transaction_date: string;
  items_bought: TransactionItemForm[];
};

type SupplierView = "overview" | "transactions" | "payments";

const initialSupplierForm: SupplierForm = {
  name: "",
  phone_number: "",
};

const initialItem: TransactionItemForm = {
  sku: "",
  name: "",
  arabic_name: "",
  quantity: "1",
  price: "0",
};

function initialTransactionForm(): TransactionForm {
  return {
    warehouse_id: "",
    transaction_date: new Date().toISOString().slice(0, 10),
    items_bought: [{ ...initialItem }],
  };
}

function toSupplierForm(supplier?: Supplier | null): SupplierForm {
  if (!supplier) {
    return initialSupplierForm;
  }

  return {
    name: supplier.name || "",
    phone_number: supplier.phone_number || "",
  };
}

function toTransactionForm(transaction?: WarehouseSupplierTransaction | null): TransactionForm {
  if (!transaction) {
    return initialTransactionForm();
  }

  return {
    warehouse_id: transaction.warehouse_id ? String(transaction.warehouse_id) : "",
    transaction_date: transaction.transaction_date ? String(transaction.transaction_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    items_bought:
      transaction.items_bought && transaction.items_bought.length > 0
        ? transaction.items_bought.map((item) => ({
            sku: item.sku || "",
            name: item.name || "",
            arabic_name: item.arabic_name || "",
            quantity: String(item.quantity ?? "1"),
            price: String(item.price ?? "0"),
          }))
        : [{ ...initialItem }],
  };
}

function transactionTotal(transaction: WarehouseSupplierTransaction) {
  return (transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.price ?? 0), 0);
}

function formTotal(form: TransactionForm) {
  return form.items_bought.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
}

function paymentBalance(payment?: SupplierPaymentHistory | null) {
  if (!payment) {
    return 0;
  }

  return Number(payment.total_amount ?? 0) - Number(payment.total_paid ?? 0);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en", {
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 2,
  }).format(value);
}

function formatExactMoney(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatEventActor(event?: SupplierPaymentEvent | null) {
  return event?.recorded_by_user?.name || "System";
}

type SearchableOption = {
  label: string;
  value: string;
};

type SearchableSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  listId: string;
};

function SearchableSelect({ label, value, onChange, options, placeholder, listId }: SearchableSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selectedOption?.label ?? value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label ?? value);
  }, [selectedOption?.label, value]);

  const filteredOptions = options
    .filter((option) => {
      const term = query.trim().toLowerCase();
      if (!term) {
        return true;
      }

      return option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term);
    })
    .slice(0, 10);

  function selectOption(option: SearchableOption) {
    setQuery(option.label);
    onChange(option.value);
    setOpen(false);
  }

  function syncTypedValue(nextValue: string) {
    setQuery(nextValue);
    setOpen(true);

    const exact = options.find(
      (option) =>
        option.value.toLowerCase() === nextValue.trim().toLowerCase() ||
        option.label.toLowerCase() === nextValue.trim().toLowerCase(),
    );

    if (exact) {
      onChange(exact.value);
      return;
    }

    if (!nextValue.trim()) {
      onChange("");
    }
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          list={listId}
          value={query}
          onChange={(event) => syncTypedValue(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!value) {
                return;
              }

              const selected = options.find((option) => option.value === value);
              if (selected) {
                setQuery(selected.label);
              }
            }, 120);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-slate-400"
        />
        {open && filteredOptions.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50"
              >
                <div className="break-words leading-5">{option.label}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function SuppliersWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<WarehouseSupplierTransaction[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentHistory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [pharmaceuticals, setPharmaceuticals] = useState<Pharmaceutical[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<SupplierView>("overview");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createSupplierForm, setCreateSupplierForm] = useState<SupplierForm>(initialSupplierForm);
  const [editSupplierForm, setEditSupplierForm] = useState<SupplierForm>(initialSupplierForm);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(initialTransactionForm);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>({});
  const [paymentNotes, setPaymentNotes] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const transactionEditorRef = useRef<HTMLDivElement | null>(null);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      if (!term) {
        return true;
      }

      return [supplier.name, supplier.phone_number, String(supplier.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, suppliers]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedId) ?? null,
    [selectedId, suppliers],
  );

  const supplierTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.supplier_id === selectedSupplier?.id),
    [selectedSupplier?.id, transactions],
  );

  const supplierPayments = useMemo(
    () => payments.filter((payment) => payment.supplier_id === selectedSupplier?.id),
    [payments, selectedSupplier?.id],
  );

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        label: warehouse.clinic?.name ? `${warehouse.name} | ${warehouse.clinic.name}` : warehouse.name,
        value: warehouse.id,
      })),
    [warehouses],
  );

  const pharmaOptions = useMemo(
    () => pharmaceuticals.map((item) => ({ label: `${item.SKU} | ${item.name}`, value: item.SKU })),
    [pharmaceuticals],
  );

  const pharmaLookup = useMemo(() => new Map(pharmaceuticals.map((item) => [item.SKU, item])), [pharmaceuticals]);

  const stats = useMemo(
    () => ({
      total: suppliers.length,
      withPhone: suppliers.filter((supplier) => Boolean(supplier.phone_number)).length,
      recent: suppliers.filter((supplier) => {
        const created = supplier.created_at ? new Date(supplier.created_at).getTime() : 0;
        return created >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      }).length,
      activeWithTransactions: new Set(transactions.map((transaction) => transaction.supplier_id)).size,
    }),
    [suppliers, transactions],
  );

  const selectedMetrics = useMemo(() => {
    const totalTransactions = supplierTransactions.length;
    const totalUnits = supplierTransactions.reduce(
      (sum, transaction) => sum + (transaction.items_bought ?? []).reduce((inner, item) => inner + Number(item.quantity ?? 0), 0),
      0,
    );
    const totalValue = supplierTransactions.reduce((sum, transaction) => sum + transactionTotal(transaction), 0);
    const openBalance = supplierPayments.reduce((sum, payment) => sum + paymentBalance(payment), 0);

    return { totalTransactions, totalUnits, totalValue, openBalance };
  }, [supplierPayments, supplierTransactions]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [supplierRows, transactionRows, paymentRows, warehouseRows, pharmaceuticalRows] = await Promise.all([
        fetchCollection<Supplier>("/suppliers"),
        fetchCollection<WarehouseSupplierTransaction>("/transactions").catch(() => []),
        fetchCollection<SupplierPaymentHistory>("/supplier-payments").catch(() => []),
        fetchCollection<Warehouse>("/warehouses").catch(() => []),
        fetchCollection<Pharmaceutical>("/pharmaceuticals").catch(() => []),
      ]);
      setSuppliers(supplierRows);
      setTransactions(transactionRows);
      setPayments(paymentRows);
      setWarehouses(warehouseRows);
      setPharmaceuticals(pharmaceuticalRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load suppliers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  useEffect(() => {
    setEditSupplierForm(toSupplierForm(selectedSupplier));
  }, [selectedSupplier]);

  useEffect(() => {
    setEditingTransactionId(null);
    setTransactionForm(initialTransactionForm());
  }, [selectedSupplier?.id]);

  function openSupplierDetails(id: number) {
    setSelectedId(id);
    setSelectedView("overview");
    setEditingTransactionId(null);
    setTransactionForm(initialTransactionForm());
    setDetailsOpen(true);
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/suppliers", "POST", {
        name: createSupplierForm.name,
        phone_number: createSupplierForm.phone_number,
      });
      setCreateSupplierForm(initialSupplierForm);
      setNotice("Supplier created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create supplier.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSupplier) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/suppliers/${selectedSupplier.id}`, "PATCH", {
        name: editSupplierForm.name,
        phone_number: editSupplierForm.phone_number,
      });
      setNotice(`Supplier "${editSupplierForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update supplier.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteSupplier(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/suppliers/${id}`);
      setNotice(`Supplier #${id} deleted successfully.`);
      if (selectedId === id) {
        setSelectedId(null);
        setDetailsOpen(false);
        setSelectedView("overview");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete supplier.");
    } finally {
      setDeletingId(null);
    }
  }

  function updateItem(index: number, patch: Partial<TransactionItemForm>) {
    setTransactionForm((current) => ({
      ...current,
      items_bought: current.items_bought.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function selectSku(index: number, sku: string) {
    const pharmaceutical = pharmaLookup.get(sku);
    updateItem(index, {
      sku,
      name: pharmaceutical?.name || "",
      arabic_name: pharmaceutical?.arabic_name || "",
    });
  }

  function addItemRow() {
    setTransactionForm((current) => ({
      ...current,
      items_bought: [...current.items_bought, { ...initialItem }],
    }));
  }

  function removeItemRow(index: number) {
    setTransactionForm((current) => ({
      ...current,
      items_bought: current.items_bought.length === 1 ? current.items_bought : current.items_bought.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function resetTransactionEditor() {
    setEditingTransactionId(null);
    setTransactionForm(initialTransactionForm());
  }

  function startTransactionEdit(transaction: WarehouseSupplierTransaction) {
    setSelectedView("transactions");
    setEditingTransactionId(transaction.id);
    setTransactionForm(toTransactionForm(transaction));
    window.setTimeout(() => {
      transactionEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function buildTransactionPayload() {
    if (!selectedSupplier) {
      return null;
    }

    return {
      warehouse_id: Number(transactionForm.warehouse_id),
      supplier_id: selectedSupplier.id,
      transaction_date: transactionForm.transaction_date,
      items_bought: transactionForm.items_bought.map((item) => ({
        sku: item.sku,
        name: item.name,
        arabic_name: item.arabic_name || null,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSupplier) {
      return;
    }

    const payload = buildTransactionPayload();
    if (!payload) {
      return;
    }

    setSavingTransaction(true);
    setError(null);
    setNotice(null);

    try {
      if (editingTransactionId) {
        await mutateJson(`/transactions/${editingTransactionId}`, "PATCH", payload);
        setNotice("Supplier batch updated successfully.");
      } else {
        await mutateJson("/transactions", "POST", payload);
        setNotice("Supplier batch recorded and warehouse inventory updated.");
      }
      resetTransactionEditor();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save supplier batch.");
    } finally {
      setSavingTransaction(false);
    }
  }

  async function deleteTransaction(id: number) {
    setDeletingTransactionId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/transactions/${id}`);
      if (editingTransactionId === id) {
        resetTransactionEditor();
      }
      setNotice(`Supplier batch #${id} deleted successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete supplier batch.");
    } finally {
      setDeletingTransactionId(null);
    }
  }

  async function recordPayment(payment: SupplierPaymentHistory, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(paymentAmounts[payment.id] || 0);
    if (!amount || amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    setPayingId(payment.id);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/supplier-payments/${payment.id}/pay`, "PATCH", {
        amount,
        notes: paymentNotes[payment.id]?.trim() || null,
      });
      setPaymentAmounts((current) => ({ ...current, [payment.id]: "" }));
      setPaymentNotes((current) => ({ ...current, [payment.id]: "" }));
      setNotice("Supplier payment recorded successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record supplier payment.");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Work suppliers like a CRM resource: search the directory first, then open a vendor popup for profile, warehouse batches, and payment position."
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Suppliers" value={formatCompactNumber(stats.total)} hint="Supplier records returned by the API." />
        <StatCard label="With Phone" value={formatCompactNumber(stats.withPhone)} hint="Suppliers with a reachable phone number." />
        <StatCard label="Recent Adds" value={formatCompactNumber(stats.recent)} hint="Suppliers created in the last 30 days." />
        <StatCard label="Active Vendors" value={formatCompactNumber(stats.activeWithTransactions)} hint="Suppliers already tied to at least one warehouse batch." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Supplier Directory" description="Search suppliers, then open one clean popup instead of living with a permanent split detail pane.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="supplier-search" value={search} onChange={setSearch} placeholder="Name, phone, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading suppliers...</div>
          ) : (
            <div className="space-y-2.5">
              {filteredSuppliers.map((supplier) => {
                const linkedTransactions = transactions.filter((transaction) => transaction.supplier_id === supplier.id).length;
                return (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => openSupplierDetails(supplier.id)}
                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-950">{supplier.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{supplier.phone_number || "No phone number"}</div>
                      </div>
                      <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">#{supplier.id}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{linkedTransactions} batches</span>
                      <span className="truncate">Created {formatLocalDateTime(supplier.created_at)}</span>
                    </div>
                  </button>
                );
              })}
              {filteredSuppliers.length === 0 ? <div className="text-sm text-slate-500">No suppliers match the current search.</div> : null}
            </div>
          )}
        </Panel>

        <Panel title="Create Supplier" description="Add a new vendor to the directory before recording warehouse batches against it.">
          <form className="space-y-4" onSubmit={createSupplier}>
            <WorkflowInput label="Name" name="create-supplier-name" value={createSupplierForm.name} onChange={(value) => setCreateSupplierForm((current) => ({ ...current, name: value }))} required />
            <WorkflowInput label="Phone Number" name="create-supplier-phone" value={createSupplierForm.phone_number} onChange={(value) => setCreateSupplierForm((current) => ({ ...current, phone_number: value }))} placeholder="+201001234567" required />
            <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
              {savingCreate ? "Saving..." : "Create Supplier"}
            </button>
          </form>
        </Panel>
      </div>

      {detailsOpen && selectedSupplier ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedSupplier.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedSupplier.phone_number || "No phone number"}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="border-b border-[var(--line)] px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "transactions", label: "Transactions" },
                  { key: "payments", label: "Payments" },
                ].map((tab) => {
                  const active = selectedView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedView(tab.key as SupplierView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-5 py-5">
              {selectedView === "overview" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Transactions" value={formatCompactNumber(selectedMetrics.totalTransactions)} hint="Warehouse intake batches recorded for this supplier." />
                    <StatCard label="Units Received" value={formatCompactNumber(selectedMetrics.totalUnits)} hint="Total units received from this supplier." />
                    <StatCard label="Batch Value" value={formatCompactMoney(selectedMetrics.totalValue)} hint="Combined value across supplier batches." />
                    <StatCard label="Open Balance" value={formatCompactMoney(selectedMetrics.openBalance)} hint="Outstanding balance from supplier payment history." />
                  </div>

                  <Panel title="Supplier Profile" description="Keep supplier identity clean, then use the tabs for operational history.">
                    <form className="space-y-4" onSubmit={updateSupplier}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <WorkflowInput label="Name" name="edit-supplier-name" value={editSupplierForm.name} onChange={(value) => setEditSupplierForm((current) => ({ ...current, name: value }))} required />
                        <WorkflowInput label="Phone Number" name="edit-supplier-phone" value={editSupplierForm.phone_number} onChange={(value) => setEditSupplierForm((current) => ({ ...current, phone_number: value }))} placeholder="+201001234567" required />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                          {savingEdit ? "Saving..." : "Save Supplier"}
                        </button>
                        <button type="button" onClick={() => void deleteSupplier(selectedSupplier.id)} disabled={deletingId === selectedSupplier.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                          {deletingId === selectedSupplier.id ? "Deleting..." : "Delete Supplier"}
                        </button>
                      </div>
                    </form>
                  </Panel>
                </div>
              ) : null}

              {selectedView === "transactions" ? (
                <div className="space-y-5">
                  <div ref={transactionEditorRef} />
                  <Panel
                    title={editingTransactionId ? `Edit Batch #${editingTransactionId}` : "Record Batch"}
                    description="Record what this supplier delivered to a warehouse. SKUs are pulled from the pharmaceutical catalog."
                    actions={
                      editingTransactionId ? (
                        <button
                          type="button"
                          onClick={resetTransactionEditor}
                          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Cancel Edit
                        </button>
                      ) : null
                    }
                  >
                    <form className="space-y-4" onSubmit={submitTransaction}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <WorkflowSelect label="Warehouse" value={transactionForm.warehouse_id} onChange={(value) => setTransactionForm((current) => ({ ...current, warehouse_id: value }))} options={warehouseOptions} required emptyLabel="Select warehouse" />
                        <WorkflowInput label="Transaction Date" name="supplier-transaction-date" type="date" value={transactionForm.transaction_date} onChange={(value) => setTransactionForm((current) => ({ ...current, transaction_date: value }))} required />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">Batch Items</div>
                            <div className="text-xs text-slate-500">Each row updates warehouse stock using an existing pharmaceutical SKU.</div>
                          </div>
                          <button type="button" onClick={addItemRow} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                            Add Item
                          </button>
                        </div>

                        {transactionForm.items_bought.map((item, index) => (
                          <div key={`${item.sku || "new"}-${index}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-slate-900">Item {index + 1}</div>
                              <button type="button" onClick={() => removeItemRow(index)} disabled={transactionForm.items_bought.length === 1} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                Remove
                              </button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                              <SearchableSelect
                                label="SKU"
                                value={item.sku}
                                onChange={(value) => selectSku(index, value)}
                                options={pharmaOptions}
                                placeholder="Search SKU or pick one"
                                listId={`supplier-sku-options-${index}`}
                              />
                              <WorkflowInput label="Name" name={`supplier-item-name-${index}`} value={item.name} onChange={(value) => updateItem(index, { name: value })} required />
                              <WorkflowInput label="Arabic Name" name={`supplier-item-arabic-name-${index}`} value={item.arabic_name} onChange={(value) => updateItem(index, { arabic_name: value })} />
                              <WorkflowInput label="Quantity" name={`supplier-item-quantity-${index}`} type="number" value={item.quantity} onChange={(value) => updateItem(index, { quantity: value })} required />
                              <WorkflowInput label="Unit Price" name={`supplier-item-price-${index}`} type="number" value={item.price} onChange={(value) => updateItem(index, { price: value })} required />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <span>Total Batch Value</span>
                        <span className="font-semibold text-slate-950">{formatExactMoney(formTotal(transactionForm))}</span>
                      </div>

                      <button type="submit" disabled={savingTransaction} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingTransaction ? "Saving..." : editingTransactionId ? "Save Batch" : "Record Batch"}
                      </button>
                    </form>
                  </Panel>

                  <Panel title="Recent Batches" description="Recent warehouse deliveries from this supplier.">
                    <div className="space-y-3">
                      {supplierTransactions.map((transaction) => {
                        const units = (transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
                        return (
                          <div key={transaction.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-slate-950">Batch #{transaction.id}</div>
                                <div className="mt-1 text-sm text-slate-600">{transaction.warehouse?.name || `Warehouse #${transaction.warehouse_id}`}</div>
                                <div className="mt-1 text-xs text-slate-500">{formatLocalDateTime(transaction.transaction_date)}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{transaction.items_bought?.length ?? 0} items</div>
                                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{formatCompactNumber(units)} units</div>
                                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{formatExactMoney(transactionTotal(transaction))}</div>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {(transaction.items_bought ?? []).map((item, index) => (
                                <div key={`${transaction.id}-${item.sku}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium text-slate-900">
                                        {item.name || item.sku}
                                        {item.sku ? <span className="ml-2 text-xs font-normal text-slate-500">{item.sku}</span> : null}
                                      </div>
                                      {item.arabic_name ? <div className="mt-0.5 text-xs text-slate-500">{item.arabic_name}</div> : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                      <span>{formatCompactNumber(Number(item.quantity ?? 0))} units</span>
                                      <span>@ {formatExactMoney(Number(item.price ?? 0))}</span>
                                      <span className="font-medium text-slate-900">{formatExactMoney(Number(item.quantity ?? 0) * Number(item.price ?? 0))}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => startTransactionEdit(transaction)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                                Edit
                              </button>
                              <button type="button" onClick={() => void deleteTransaction(transaction.id)} disabled={deletingTransactionId === transaction.id} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                                {deletingTransactionId === transaction.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {supplierTransactions.length === 0 ? <div className="text-sm text-slate-500">No warehouse batches recorded for this supplier yet.</div> : null}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedView === "payments" ? (
                <Panel title="Payment Position" description="Current payment records linked to this supplier's warehouse batches.">
                  <div className="space-y-3">
                    {supplierPayments.map((payment) => (
                      <div key={payment.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">Payment #{payment.id}</div>
                            <div className="mt-1 text-sm text-slate-600">Transaction #{payment.transaction_id}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatLocalDateTime(payment.created_at)}</div>
                            <div className="mt-1 text-xs text-slate-500">Status: {payment.payment_status || "unpaid"}</div>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div>Total {formatExactMoney(Number(payment.total_amount ?? 0))}</div>
                            <div>Paid {formatExactMoney(Number(payment.total_paid ?? 0))}</div>
                            <div>Open {formatExactMoney(paymentBalance(payment))}</div>
                          </div>
                        </div>
                        {paymentBalance(payment) > 0 ? (
                          <form className="mt-3 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={(event) => void recordPayment(payment, event)}>
                            <div className="min-w-0 flex-1">
                              <WorkflowInput
                                label="Record Payment"
                                name={`supplier-payment-${payment.id}`}
                                type="number"
                                value={paymentAmounts[payment.id] ?? ""}
                                onChange={(value) => setPaymentAmounts((current) => ({ ...current, [payment.id]: value }))}
                                placeholder="0.00"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <WorkflowInput
                                label="Notes"
                                name={`supplier-payment-note-${payment.id}`}
                                value={paymentNotes[payment.id] ?? ""}
                                onChange={(value) => setPaymentNotes((current) => ({ ...current, [payment.id]: value }))}
                                placeholder="Optional note"
                              />
                            </div>
                            <button type="submit" disabled={payingId === payment.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                              {payingId === payment.id ? "Saving..." : "Add Payment"}
                            </button>
                          </form>
                        ) : (
                          <div className="mt-3 text-xs font-medium text-emerald-700">Fully paid.</div>
                        )}

                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-sm font-medium text-slate-900">Payment Events</div>
                          <div className="mt-3 space-y-2">
                            {(payment.payment_events ?? []).map((eventRecord) => (
                              <div key={eventRecord.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">{formatExactMoney(Number(eventRecord.amount ?? 0))}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {formatLocalDateTime(eventRecord.paid_at || eventRecord.created_at)} by {formatEventActor(eventRecord)}
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500">Event #{eventRecord.id}</div>
                                </div>
                                {eventRecord.notes ? <div className="mt-2 text-xs text-slate-600">{eventRecord.notes}</div> : null}
                              </div>
                            ))}
                            {(payment.payment_events ?? []).length === 0 ? <div className="text-xs text-slate-500">No payment events recorded yet.</div> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                    {supplierPayments.length === 0 ? <div className="text-sm text-slate-500">No payment records linked to this supplier yet.</div> : null}
                  </div>
                </Panel>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
