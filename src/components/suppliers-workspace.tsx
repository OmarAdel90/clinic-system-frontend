"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Supplier, SupplierPaymentHistory, WarehouseSupplierTransaction } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { StatCard } from "@/components/stat-card";

type SupplierForm = {
  name: string;
  phone_number: string;
};

type SupplierView = "overview" | "transactions" | "payments";

const initialForm: SupplierForm = {
  name: "",
  phone_number: "",
};

function toForm(supplier?: Supplier | null): SupplierForm {
  if (!supplier) {
    return initialForm;
  }

  return {
    name: supplier.name || "",
    phone_number: supplier.phone_number || "",
  };
}

function transactionTotal(transaction: WarehouseSupplierTransaction) {
  return (transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.price ?? 0), 0);
}

function paymentBalance(payment?: SupplierPaymentHistory | null) {
  if (!payment) {
    return 0;
  }

  return Number(payment.total_amount ?? 0) - Number(payment.total_paid ?? 0);
}

export function SuppliersWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<WarehouseSupplierTransaction[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentHistory[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<SupplierView>("overview");
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<SupplierForm>(initialForm);
  const [editForm, setEditForm] = useState<SupplierForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      const [supplierRows, transactionRows, paymentRows] = await Promise.all([
        fetchCollection<Supplier>("/suppliers"),
        fetchCollection<WarehouseSupplierTransaction>("/transactions").catch(() => []),
        fetchCollection<SupplierPaymentHistory>("/supplier-payments").catch(() => []),
      ]);
      setSuppliers(supplierRows);
      setTransactions(transactionRows);
      setPayments(paymentRows);
      setSelectedId((current) => current ?? null);
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
    setEditForm(toForm(selectedSupplier));
  }, [selectedSupplier]);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/suppliers", "POST", {
        name: createForm.name,
        phone_number: createForm.phone_number,
      });
      setCreateForm(initialForm);
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
        name: editForm.name,
        phone_number: editForm.phone_number,
      });
      setNotice(`Supplier "${editForm.name}" updated successfully.`);
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
        setSelectedView("overview");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete supplier.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Work suppliers like a CRM resource: start from the directory, then open supplier-level details, transactions, and payment position from the top submenu."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Suppliers" value={stats.total} hint="Supplier records returned by the API." />
        <StatCard label="With Phone" value={stats.withPhone} hint="Suppliers with a reachable phone number." />
        <StatCard label="Recent Adds" value={stats.recent} hint="Suppliers created in the last 30 days." />
        <StatCard label="Active Vendors" value={stats.activeWithTransactions} hint="Suppliers already tied to at least one warehouse transaction." />
      </div>

      <Panel title="Supplier Directory" description="Search suppliers, select one, then open its CRM-style detail submenu above the content area.">
        <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div>
            <div className="mb-4">
              <WorkflowInput label="Search" name="supplier-search" value={search} onChange={setSearch} placeholder="Name, phone, or id" />
            </div>

            {loading ? (
              <div className="text-sm text-slate-500">Loading suppliers...</div>
            ) : (
              <div className="space-y-3">
                {filteredSuppliers.map((supplier) => {
                  const active = selectedSupplier?.id === supplier.id;
                  const linkedTransactions = transactions.filter((transaction) => transaction.supplier_id === supplier.id).length;
                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(supplier.id);
                        setSelectedView("overview");
                      }}
                      className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{supplier.name}</div>
                          <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>{supplier.phone_number || "No phone number"}</div>
                        </div>
                        <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? "bg-white/10 text-white" : "bg-white text-slate-600"}`}>#{supplier.id}</div>
                      </div>
                      <div className={`mt-3 flex items-center justify-between text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                        <span>{linkedTransactions} transactions</span>
                        <span>Created {formatLocalDateTime(supplier.created_at)}</span>
                      </div>
                    </button>
                  );
                })}
                {filteredSuppliers.length === 0 ? <div className="text-sm text-slate-500">No suppliers match the current search.</div> : null}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Panel title="Create Supplier" description="Add a new vendor to the directory before recording warehouse batches against it.">
              <form className="space-y-4" onSubmit={createSupplier}>
                <WorkflowInput label="Name" name="create-supplier-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
                <WorkflowInput label="Phone Number" name="create-supplier-phone" value={createForm.phone_number} onChange={(value) => setCreateForm((current) => ({ ...current, phone_number: value }))} placeholder="+201001234567" required />
                <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                  {savingCreate ? "Saving..." : "Create Supplier"}
                </button>
              </form>
            </Panel>

            {selectedSupplier ? (
              <Panel title={selectedSupplier.name} description="Use the submenu to switch between the supplier overview, warehouse transaction history, and payment records.">
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-4">
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

                  {selectedView === "overview" ? (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{selectedSupplier.name}</div>
                            <div className="mt-1 text-sm text-slate-600">{selectedSupplier.phone_number || "No phone number"}</div>
                            <div className="mt-2 text-xs text-slate-500">Created {formatLocalDateTime(selectedSupplier.created_at)}</div>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">Supplier #{selectedSupplier.id}</div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <StatCard label="Transactions" value={selectedMetrics.totalTransactions} hint="Warehouse intake batches recorded for this supplier." />
                        <StatCard label="Units Received" value={selectedMetrics.totalUnits} hint="Total quantities received across supplier batches." />
                        <StatCard label="Recorded Value" value={selectedMetrics.totalValue.toFixed(2)} hint="Transaction value accumulated for this supplier." />
                        <StatCard label="Open Balance" value={selectedMetrics.openBalance.toFixed(2)} hint="Remaining unpaid supplier balance." />
                      </div>

                      <form className="space-y-4" onSubmit={updateSupplier}>
                        <div className="grid gap-4 md:grid-cols-2">
                          <WorkflowInput label="Name" name="edit-supplier-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                          <WorkflowInput label="Phone Number" name="edit-supplier-phone" value={editForm.phone_number} onChange={(value) => setEditForm((current) => ({ ...current, phone_number: value }))} placeholder="+201001234567" required />
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                            {savingEdit ? "Saving..." : "Save Changes"}
                          </button>
                          <button type="button" onClick={() => void deleteSupplier(selectedSupplier.id)} disabled={deletingId === selectedSupplier.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                            {deletingId === selectedSupplier.id ? "Deleting..." : "Delete Supplier"}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}

                  {selectedView === "transactions" ? (
                    <div className="space-y-3">
                      {supplierTransactions.slice(0, 12).map((transaction) => (
                        <div key={transaction.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">Transaction #{transaction.id}</div>
                            <div className="text-xs text-slate-500">{formatLocalDateTime(transaction.transaction_date || transaction.created_at)}</div>
                          </div>
                          <div className="mt-2 text-sm text-slate-600">{transaction.warehouse?.name || `Warehouse #${transaction.warehouse_id}`}</div>
                          <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                            <div>Items: {transaction.items_bought?.length ?? 0}</div>
                            <div>Units: {(transaction.items_bought ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)}</div>
                            <div>Value: {transactionTotal(transaction).toFixed(2)}</div>
                            <div>Clinic: {transaction.warehouse?.clinic?.name || "-"}</div>
                          </div>
                        </div>
                      ))}
                      {supplierTransactions.length === 0 ? <div className="text-sm text-slate-500">No warehouse batches recorded for this supplier yet.</div> : null}
                    </div>
                  ) : null}

                  {selectedView === "payments" ? (
                    <div className="space-y-3">
                      {supplierPayments.slice(0, 12).map((payment) => (
                        <div key={payment.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">Payment #{payment.id}</div>
                            <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{payment.payment_status || "unpaid"}</div>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                            <div>Total: {Number(payment.total_amount ?? 0).toFixed(2)}</div>
                            <div>Paid: {Number(payment.total_paid ?? 0).toFixed(2)}</div>
                            <div>Balance: {paymentBalance(payment).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                      {supplierPayments.length === 0 ? <div className="text-sm text-slate-500">No payment records linked to this supplier yet.</div> : null}
                    </div>
                  ) : null}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}
