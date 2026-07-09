"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Pharmaceutical, Supplier, Warehouse, WarehouseSupplierTransaction } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

type TransactionItemForm = {
  sku: string;
  name: string;
  arabic_name: string;
  quantity: string;
  price: string;
};

type TransactionForm = {
  warehouse_id: string;
  supplier_id: string;
  batch_number: string;
  transaction_date: string;
  items_bought: TransactionItemForm[];
};

const initialItem: TransactionItemForm = {
  sku: "",
  name: "",
  arabic_name: "",
  quantity: "1",
  price: "0",
};

const initialForm: TransactionForm = {
  warehouse_id: "",
  supplier_id: "",
  batch_number: "",
  transaction_date: new Date().toISOString().slice(0, 10),
  items_bought: [{ ...initialItem }],
};

function totalAmount(transaction: WarehouseSupplierTransaction) {
  return (transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.price ?? 0), 0);
}

function formTotal(form: TransactionForm) {
  return form.items_bought.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
}

export function SupplierTransactionsWorkspace() {
  const [transactions, setTransactions] = useState<WarehouseSupplierTransaction[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pharmaceuticals, setPharmaceuticals] = useState<Pharmaceutical[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<TransactionForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (!term) {
        return true;
      }

      return [
        transaction.transaction_id,
        transaction.batch_number,
        transaction.supplier?.name,
        transaction.warehouse?.name,
        transaction.warehouse?.clinic?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, transactions]);

  const selectedTransaction = useMemo(
    () =>
      transactions.find((transaction) => transaction.transaction_id === selectedTransactionId) ??
      filteredTransactions[0] ??
      transactions[0] ??
      null,
    [filteredTransactions, selectedTransactionId, transactions],
  );

  const stats = useMemo(
    () => ({
      total: transactions.length,
      batches: new Set(transactions.map((transaction) => transaction.batch_number).filter(Boolean)).size,
      units: transactions.reduce(
        (sum, transaction) =>
          sum + (transaction.items_bought ?? []).reduce((inner, item) => inner + Number(item.quantity ?? 0), 0),
        0,
      ),
      value: transactions.reduce((sum, transaction) => sum + totalAmount(transaction), 0),
    }),
    [transactions],
  );

  const warehouseOptions = useMemo(
    () => warehouses.map((warehouse) => ({ label: `${warehouse.name}${warehouse.clinic?.name ? ` | ${warehouse.clinic.name}` : ""}`, value: warehouse.id })),
    [warehouses],
  );

  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })),
    [suppliers],
  );

  const pharmaLookup = useMemo(() => new Map(pharmaceuticals.map((item) => [item.SKU, item])), [pharmaceuticals]);

  async function load(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [transactionRows, warehouseRows, supplierRows, pharmaceuticalRows] = await Promise.all([
        fetchCollection<WarehouseSupplierTransaction>("/transactions"),
        fetchCollection<Warehouse>("/warehouses"),
        fetchCollection<Supplier>("/suppliers"),
        fetchCollection<Pharmaceutical>("/pharmaceuticals"),
      ]);

      setTransactions(transactionRows);
      setWarehouses(warehouseRows);
      setSuppliers(supplierRows);
      setPharmaceuticals(pharmaceuticalRows);
      setSelectedTransactionId((current) => current ?? transactionRows[0]?.transaction_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load supplier transactions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  function updateItem(index: number, patch: Partial<TransactionItemForm>) {
    setForm((current) => ({
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
    setForm((current) => ({
      ...current,
      items_bought: [...current.items_bought, { ...initialItem }],
    }));
  }

  function removeItemRow(index: number) {
    setForm((current) => ({
      ...current,
      items_bought: current.items_bought.length === 1 ? current.items_bought : current.items_bought.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/transactions", "POST", {
        warehouse_id: Number(form.warehouse_id),
        supplier_id: Number(form.supplier_id),
        batch_number: form.batch_number,
        transaction_date: form.transaction_date,
        items_bought: form.items_bought.map((item) => ({
          sku: item.sku,
          name: item.name,
          arabic_name: item.arabic_name || null,
          quantity: Number(item.quantity),
          price: Number(item.price),
        })),
      });
      setForm({ ...initialForm, items_bought: [{ ...initialItem }], transaction_date: new Date().toISOString().slice(0, 10) });
      setNotice("Supplier batch recorded and warehouse inventory updated.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create supplier transaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Transactions"
        description="Record inbound supplier batches against a warehouse, validate SKUs against the pharmaceutical catalog, and keep intake history visible."
        actions={
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transactions" value={stats.total} hint="Supplier intake records currently returned by the API." />
        <StatCard label="Batch Numbers" value={stats.batches} hint="Distinct supplier batches recorded so far." />
        <StatCard label="Units Received" value={stats.units} hint="Total item quantities across loaded batches." />
        <StatCard label="Recorded Value" value={stats.value.toFixed(2)} hint="Quantity multiplied by price across all loaded items." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Transaction History" description="Recent inbound supplier batches with warehouse and supplier context.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="transaction-search" value={search} onChange={setSearch} placeholder="Batch, supplier, warehouse, clinic, or transaction id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading supplier transactions...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No supplier transactions match the current search.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => {
                const active = selectedTransaction?.transaction_id === transaction.transaction_id;
                const units = (transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
                return (
                  <button
                    key={transaction.transaction_id}
                    type="button"
                    onClick={() => setSelectedTransactionId(transaction.transaction_id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{transaction.batch_number || transaction.transaction_id}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>
                          {transaction.supplier?.name || `Supplier #${transaction.supplier_id}`} | {transaction.warehouse?.name || `Warehouse #${transaction.warehouse_id}`}
                        </div>
                      </div>
                      <div className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{formatLocalDateTime(transaction.transaction_date)}</div>
                    </div>
                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-3 ${active ? "text-slate-300" : "text-slate-500"}`}>
                      <div>Items: {transaction.items_bought?.length ?? 0}</div>
                      <div>Units: {units}</div>
                      <div>Value: {totalAmount(transaction).toFixed(2)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Record Batch" description="Create a supplier delivery batch. Each SKU must already exist in the pharmaceutical catalog.">
            <form className="space-y-4" onSubmit={createTransaction}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowSelect label="Warehouse" value={form.warehouse_id} onChange={(value) => setForm((current) => ({ ...current, warehouse_id: value }))} options={warehouseOptions} required emptyLabel="Select warehouse" />
                <WorkflowSelect label="Supplier" value={form.supplier_id} onChange={(value) => setForm((current) => ({ ...current, supplier_id: value }))} options={supplierOptions} required emptyLabel="Select supplier" />
                <WorkflowInput label="Batch Number" name="batch-number" value={form.batch_number} onChange={(value) => setForm((current) => ({ ...current, batch_number: value }))} required />
                <WorkflowInput label="Transaction Date" name="transaction-date" type="date" value={form.transaction_date} onChange={(value) => setForm((current) => ({ ...current, transaction_date: value }))} required />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">Batch Items</div>
                  <button type="button" onClick={addItemRow} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Add Item
                  </button>
                </div>

                {form.items_bought.map((item, index) => (
                  <div key={`${index}-${item.sku}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">Item {index + 1}</div>
                      <button type="button" onClick={() => removeItemRow(index)} disabled={form.items_bought.length === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowSelect
                        label="SKU"
                        value={item.sku}
                        onChange={(value) => selectSku(index, value)}
                        options={pharmaceuticals.map((pharmaceutical) => ({ label: `${pharmaceutical.SKU} | ${pharmaceutical.name}`, value: pharmaceutical.SKU }))}
                        required
                        emptyLabel="Select SKU"
                      />
                      <WorkflowInput label="Name" name={`item-name-${index}`} value={item.name} onChange={(value) => updateItem(index, { name: value })} required />
                      <WorkflowInput label="Arabic Name" name={`item-arabic-name-${index}`} value={item.arabic_name} onChange={(value) => updateItem(index, { arabic_name: value })} />
                      <WorkflowInput label="Quantity" name={`item-quantity-${index}`} type="number" value={item.quantity} onChange={(value) => updateItem(index, { quantity: value })} required />
                      <WorkflowInput label="Unit Price" name={`item-price-${index}`} type="number" value={item.price} onChange={(value) => updateItem(index, { price: value })} required />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-slate-700">
                Total Batch Value: <span className="font-semibold text-slate-950">{formTotal(form).toFixed(2)}</span>
              </div>

              <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {saving ? "Saving..." : "Record Supplier Batch"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Transaction" description="See the actual batch contents that were pushed into warehouse inventory.">
            {selectedTransaction ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedTransaction.batch_number || selectedTransaction.transaction_id}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedTransaction.supplier?.name || `Supplier #${selectedTransaction.supplier_id}`} to {selectedTransaction.warehouse?.name || `Warehouse #${selectedTransaction.warehouse_id}`}</div>
                  <div className="mt-2 text-xs text-slate-500">Recorded {formatLocalDateTime(selectedTransaction.created_at || selectedTransaction.transaction_date)}</div>
                </div>

                <div className="space-y-3">
                  {(selectedTransaction.items_bought ?? []).map((item) => (
                    <div key={`${selectedTransaction.transaction_id}-${item.sku}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.sku}</div>
                          {item.arabic_name ? <div className="mt-1 text-xs text-slate-500">{item.arabic_name}</div> : null}
                        </div>
                        <div className="text-right text-sm text-slate-700">
                          <div>Qty: {item.quantity}</div>
                          <div>Price: {Number(item.price).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a transaction to inspect its batch contents.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
