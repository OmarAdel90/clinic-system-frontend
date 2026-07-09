"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type {
  Pharmaceutical,
  Supplier,
  SupplierPaymentHistory,
  Warehouse,
  WarehouseSupplierTransaction,
} from "@/lib/types";
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
  transaction_date: new Date().toISOString().slice(0, 10),
  items_bought: [{ ...initialItem }],
};

function toForm(transaction?: WarehouseSupplierTransaction | null): TransactionForm {
  if (!transaction) {
    return { ...initialForm, items_bought: [{ ...initialItem }] };
  }

  return {
    warehouse_id: String(transaction.warehouse_id ?? ""),
    supplier_id: String(transaction.supplier_id ?? ""),
    transaction_date: transaction.transaction_date ? String(transaction.transaction_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    items_bought:
      transaction.items_bought?.length
        ? transaction.items_bought.map((item) => ({
            sku: item.sku || "",
            name: item.name || "",
            arabic_name: item.arabic_name || "",
            quantity: String(item.quantity ?? 1),
            price: String(item.price ?? 0),
          }))
        : [{ ...initialItem }],
  };
}

function totalAmount(transaction: WarehouseSupplierTransaction) {
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

export function SupplierTransactionsWorkspace() {
  const [transactions, setTransactions] = useState<WarehouseSupplierTransaction[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentHistory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pharmaceuticals, setPharmaceuticals] = useState<Pharmaceutical[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<TransactionForm>(initialForm);
  const [editForm, setEditForm] = useState<TransactionForm>(initialForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [paying, setPaying] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const selectedPayment = useMemo(
    () => payments.find((payment) => payment.transaction_id === selectedTransaction?.transaction_id) ?? null,
    [payments, selectedTransaction?.transaction_id],
  );

  const stats = useMemo(
    () => ({
      total: transactions.length,
      units: transactions.reduce(
        (sum, transaction) =>
          sum + (transaction.items_bought ?? []).reduce((inner, item) => inner + Number(item.quantity ?? 0), 0),
        0,
      ),
      value: transactions.reduce((sum, transaction) => sum + totalAmount(transaction), 0),
      unpaid: payments.filter((payment) => payment.payment_status !== "paid").length,
    }),
    [payments, transactions],
  );

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((warehouse) => ({
        label: `${warehouse.name}${warehouse.clinic?.name ? ` | ${warehouse.clinic.name}` : ""}`,
        value: warehouse.id,
      })),
    [warehouses],
  );

  const supplierOptions = useMemo(() => suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })), [suppliers]);

  const pharmaLookup = useMemo(() => new Map(pharmaceuticals.map((item) => [item.SKU, item])), [pharmaceuticals]);

  async function load(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [transactionRows, paymentRows, warehouseRows, supplierRows, pharmaceuticalRows] = await Promise.all([
        fetchCollection<WarehouseSupplierTransaction>("/transactions"),
        fetchCollection<SupplierPaymentHistory>("/supplier-payments").catch(() => []),
        fetchCollection<Warehouse>("/warehouses"),
        fetchCollection<Supplier>("/suppliers"),
        fetchCollection<Pharmaceutical>("/pharmaceuticals"),
      ]);

      setTransactions(transactionRows);
      setPayments(paymentRows);
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

  useEffect(() => {
    setEditForm(toForm(selectedTransaction));
    setPaymentAmount("");
  }, [selectedTransaction]);

  function updateItem(
    kind: "create" | "edit",
    index: number,
    patch: Partial<TransactionItemForm>,
  ) {
    const setter = kind === "create" ? setCreateForm : setEditForm;
    setter((current) => ({
      ...current,
      items_bought: current.items_bought.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function selectSku(kind: "create" | "edit", index: number, sku: string) {
    const pharmaceutical = pharmaLookup.get(sku);
    updateItem(kind, index, {
      sku,
      name: pharmaceutical?.name || "",
      arabic_name: pharmaceutical?.arabic_name || "",
    });
  }

  function addItemRow(kind: "create" | "edit") {
    const setter = kind === "create" ? setCreateForm : setEditForm;
    setter((current) => ({
      ...current,
      items_bought: [...current.items_bought, { ...initialItem }],
    }));
  }

  function removeItemRow(kind: "create" | "edit", index: number) {
    const setter = kind === "create" ? setCreateForm : setEditForm;
    setter((current) => ({
      ...current,
      items_bought:
        current.items_bought.length === 1
          ? current.items_bought
          : current.items_bought.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function buildPayload(form: TransactionForm) {
    return {
      warehouse_id: Number(form.warehouse_id),
      supplier_id: Number(form.supplier_id),
      transaction_date: form.transaction_date,
      items_bought: form.items_bought.map((item) => ({
        sku: item.sku,
        name: item.name,
        arabic_name: item.arabic_name || null,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/transactions", "POST", buildPayload(createForm));
      setCreateForm({ ...initialForm, items_bought: [{ ...initialItem }], transaction_date: new Date().toISOString().slice(0, 10) });
      setNotice("Supplier batch recorded and warehouse inventory updated.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create supplier transaction.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTransaction) {
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/transactions/${selectedTransaction.transaction_id}`, "PATCH", buildPayload(editForm));
      setNotice("Supplier transaction updated successfully.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update supplier transaction.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteTransaction(transactionId: string) {
    setDeletingId(transactionId);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/transactions/${transactionId}`);
      setNotice("Supplier transaction deleted successfully.");
      if (selectedTransactionId === transactionId) {
        setSelectedTransactionId(null);
      }
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete supplier transaction.");
    } finally {
      setDeletingId(null);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayment) {
      return;
    }

    setPaying(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/supplier-payments/${selectedPayment.id}/pay`, "PATCH", {
        amount: Number(paymentAmount),
      });
      setPaymentAmount("");
      setNotice("Supplier payment recorded successfully.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record supplier payment.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Transactions"
        description="Record inbound supplier batches against a warehouse, validate SKUs against the pharmaceutical catalog, and keep intake plus payment history visible."
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
        <StatCard label="Units Received" value={stats.units} hint="Total item quantities across loaded batches." />
        <StatCard label="Recorded Value" value={stats.value.toFixed(2)} hint="Quantity multiplied by price across all loaded items." />
        <StatCard label="Open Payables" value={stats.unpaid} hint="Supplier payment records that are not yet fully paid." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Transaction History" description="Recent inbound supplier batches with warehouse and supplier context.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="transaction-search" value={search} onChange={setSearch} placeholder="Supplier, warehouse, clinic, or transaction id" />
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
                const payment = payments.find((entry) => entry.transaction_id === transaction.transaction_id);
                return (
                  <button
                    key={transaction.transaction_id}
                    type="button"
                    onClick={() => setSelectedTransactionId(transaction.transaction_id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{transaction.supplier?.name || `Supplier #${transaction.supplier_id}`}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>
                          {transaction.warehouse?.name || `Warehouse #${transaction.warehouse_id}`}
                        </div>
                      </div>
                      <div className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{formatLocalDateTime(transaction.transaction_date)}</div>
                    </div>
                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-4 ${active ? "text-slate-300" : "text-slate-500"}`}>
                      <div>Items: {transaction.items_bought?.length ?? 0}</div>
                      <div>Units: {units}</div>
                      <div>Value: {totalAmount(transaction).toFixed(2)}</div>
                      <div>Status: {payment?.payment_status || "unpaid"}</div>
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
                <WorkflowSelect label="Warehouse" value={createForm.warehouse_id} onChange={(value) => setCreateForm((current) => ({ ...current, warehouse_id: value }))} options={warehouseOptions} required emptyLabel="Select warehouse" />
                <WorkflowSelect label="Supplier" value={createForm.supplier_id} onChange={(value) => setCreateForm((current) => ({ ...current, supplier_id: value }))} options={supplierOptions} required emptyLabel="Select supplier" />
                <WorkflowInput label="Transaction Date" name="transaction-date" type="date" value={createForm.transaction_date} onChange={(value) => setCreateForm((current) => ({ ...current, transaction_date: value }))} required />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">Batch Items</div>
                  <button type="button" onClick={() => addItemRow("create")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Add Item
                  </button>
                </div>

                {createForm.items_bought.map((item, index) => (
                  <div key={`create-${index}-${item.sku}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">Item {index + 1}</div>
                      <button type="button" onClick={() => removeItemRow("create", index)} disabled={createForm.items_bought.length === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowSelect label="SKU" value={item.sku} onChange={(value) => selectSku("create", index, value)} options={pharmaceuticals.map((pharmaceutical) => ({ label: `${pharmaceutical.SKU} | ${pharmaceutical.name}`, value: pharmaceutical.SKU }))} required emptyLabel="Select SKU" />
                      <WorkflowInput label="Name" name={`create-item-name-${index}`} value={item.name} onChange={(value) => updateItem("create", index, { name: value })} required />
                      <WorkflowInput label="Arabic Name" name={`create-item-arabic-name-${index}`} value={item.arabic_name} onChange={(value) => updateItem("create", index, { arabic_name: value })} />
                      <WorkflowInput label="Quantity" name={`create-item-quantity-${index}`} type="number" value={item.quantity} onChange={(value) => updateItem("create", index, { quantity: value })} required />
                      <WorkflowInput label="Unit Price" name={`create-item-price-${index}`} type="number" value={item.price} onChange={(value) => updateItem("create", index, { price: value })} required />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-slate-700">
                Total Batch Value: <span className="font-semibold text-slate-950">{formTotal(createForm).toFixed(2)}</span>
              </div>

              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Record Supplier Batch"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Transaction" description="Edit transaction contents, inspect the linked payable, or remove the transaction entirely.">
            {selectedTransaction ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedTransaction.transaction_id}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedTransaction.supplier?.name || `Supplier #${selectedTransaction.supplier_id}`} to {selectedTransaction.warehouse?.name || `Warehouse #${selectedTransaction.warehouse_id}`}</div>
                  <div className="mt-2 text-xs text-slate-500">Recorded {formatLocalDateTime(selectedTransaction.created_at || selectedTransaction.transaction_date)}</div>
                </div>

                <form className="space-y-4" onSubmit={updateTransaction}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowSelect label="Warehouse" value={editForm.warehouse_id} onChange={(value) => setEditForm((current) => ({ ...current, warehouse_id: value }))} options={warehouseOptions} required emptyLabel="Select warehouse" />
                    <WorkflowSelect label="Supplier" value={editForm.supplier_id} onChange={(value) => setEditForm((current) => ({ ...current, supplier_id: value }))} options={supplierOptions} required emptyLabel="Select supplier" />
                    <WorkflowInput label="Transaction Date" name="edit-transaction-date" type="date" value={editForm.transaction_date} onChange={(value) => setEditForm((current) => ({ ...current, transaction_date: value }))} required />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-700">Batch Items</div>
                      <button type="button" onClick={() => addItemRow("edit")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                        Add Item
                      </button>
                    </div>

                    {editForm.items_bought.map((item, index) => (
                      <div key={`edit-${index}-${item.sku}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-950">Item {index + 1}</div>
                          <button type="button" onClick={() => removeItemRow("edit", index)} disabled={editForm.items_bought.length === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                            Remove
                          </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <WorkflowSelect label="SKU" value={item.sku} onChange={(value) => selectSku("edit", index, value)} options={pharmaceuticals.map((pharmaceutical) => ({ label: `${pharmaceutical.SKU} | ${pharmaceutical.name}`, value: pharmaceutical.SKU }))} required emptyLabel="Select SKU" />
                          <WorkflowInput label="Name" name={`edit-item-name-${index}`} value={item.name} onChange={(value) => updateItem("edit", index, { name: value })} required />
                          <WorkflowInput label="Arabic Name" name={`edit-item-arabic-name-${index}`} value={item.arabic_name} onChange={(value) => updateItem("edit", index, { arabic_name: value })} />
                          <WorkflowInput label="Quantity" name={`edit-item-quantity-${index}`} type="number" value={item.quantity} onChange={(value) => updateItem("edit", index, { quantity: value })} required />
                          <WorkflowInput label="Unit Price" name={`edit-item-price-${index}`} type="number" value={item.price} onChange={(value) => updateItem("edit", index, { price: value })} required />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-slate-700">
                    Updated Batch Value: <span className="font-semibold text-slate-950">{formTotal(editForm).toFixed(2)}</span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {savingEdit ? "Saving..." : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => void deleteTransaction(selectedTransaction.transaction_id)} disabled={deletingId === selectedTransaction.transaction_id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {deletingId === selectedTransaction.transaction_id ? "Deleting..." : "Delete Transaction"}
                    </button>
                  </div>
                </form>

                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">Supplier Payment</div>
                  {selectedPayment ? (
                    <div className="mt-3 space-y-4">
                      <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                        <div>Total: {Number(selectedPayment.total_amount).toFixed(2)}</div>
                        <div>Paid: {Number(selectedPayment.total_paid).toFixed(2)}</div>
                        <div>Balance: {paymentBalance(selectedPayment).toFixed(2)}</div>
                      </div>
                      <div className="text-xs text-slate-500">Status: {selectedPayment.payment_status || "unpaid"}</div>

                      <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={recordPayment}>
                        <div className="min-w-0 flex-1">
                          <WorkflowInput label="Record Payment" name="payment-amount" type="number" value={paymentAmount} onChange={setPaymentAmount} />
                        </div>
                        <button type="submit" disabled={paying} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                          {paying ? "Saving..." : "Add Payment"}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">No linked payment record was returned for this transaction.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a transaction to inspect or edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
