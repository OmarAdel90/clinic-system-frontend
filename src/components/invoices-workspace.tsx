"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Invoice } from "@/lib/types";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

export function InvoicesWorkspace() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<number | null>(null);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const leadName = invoice.lead?.name || invoice.lead?.profile_name || "";
      const clinicName = invoice.clinic?.name || "";
      const matchesSearch =
        !term ||
        [leadName, clinicName, invoice.invoice_number, String(invoice.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const selectedInvoice = useMemo(
    () => filteredInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? filteredInvoices[0] ?? invoices[0] ?? null,
    [filteredInvoices, invoices, selectedInvoiceId],
  );

  const stats = useMemo(() => ({
    total: invoices.length,
    unpaid: invoices.filter((invoice) => invoice.status === "unpaid").length,
    partial: invoices.filter((invoice) => invoice.status === "partial").length,
    paid: invoices.filter((invoice) => invoice.status === "paid").length,
  }), [invoices]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCollection<Invoice>("/invoices");
      setInvoices(rows);
      setSelectedInvoiceId((current) => current ?? rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function submitPayment(event: FormEvent<HTMLFormElement>, invoiceId: number) {
    event.preventDefault();
    setActiveInvoice(invoiceId);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/invoices/${invoiceId}/pay`, "PATCH", {
        amount: Number(payments[invoiceId] || 0),
      });
      setPayments((current) => ({ ...current, [invoiceId]: "" }));
      setNotice(`Payment recorded for invoice #${invoiceId}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record payment.");
    } finally {
      setActiveInvoice(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description={`Track balances, view visit/report billing context, and record payments in ${getBrowserTimeZone()}.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Invoices" value={stats.total} hint="Billing records currently returned by the API." />
        <StatCard label="Unpaid" value={stats.unpaid} hint="Invoices with no payment recorded yet." />
        <StatCard label="Partial" value={stats.partial} hint="Invoices with a remaining balance still open." />
        <StatCard label="Paid" value={stats.paid} hint="Invoices fully settled." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <Panel title="Payment Queue" description="Quick payment handling with enough context to know what each invoice belongs to.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowInput label="Search" name="invoice-search" value={search} onChange={setSearch} placeholder="Lead, clinic, invoice number, or id" />
            <WorkflowSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Unpaid", value: "unpaid" },
                { label: "Partial", value: "partial" },
                { label: "Paid", value: "paid" },
              ]}
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading invoices...</div>
          ) : (
            <div className="space-y-4">
              {filteredInvoices.map((invoice) => (
                <div key={invoice.id} className={`grid gap-4 rounded-xl border p-4 lg:grid-cols-[1fr_auto] ${selectedInvoice?.id === invoice.id ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                  <button type="button" onClick={() => setSelectedInvoiceId(invoice.id)} className="text-left">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-sm font-semibold text-slate-950">
                        {invoice.invoice_number || `Invoice #${invoice.id}`}
                      </div>
                      <StatusBadge value={invoice.status} />
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {invoice.lead?.name || invoice.lead?.profile_name || `Lead #${invoice.lead_id ?? "-"}`} | {invoice.clinic?.name || `Clinic #${invoice.clinic_id ?? "-"}`}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                      <div>Total: {invoice.total_cost ?? 0}</div>
                      <div>Paid: {invoice.amount_paid ?? 0}</div>
                      <div>Issued: {formatLocalDateTime(invoice.issued_at)}</div>
                    </div>
                  </button>

                  <form className="flex min-w-[240px] flex-col gap-3" onSubmit={(event) => submitPayment(event, invoice.id)}>
                    <WorkflowInput
                      label="Payment Amount"
                      name={`amount-${invoice.id}`}
                      type="number"
                      value={payments[invoice.id] ?? ""}
                      onChange={(value) =>
                        setPayments((current) => ({
                          ...current,
                          [invoice.id]: value,
                        }))
                      }
                      placeholder="0.00"
                      required
                    />
                    <button type="submit" disabled={activeInvoice === invoice.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {activeInvoice === invoice.id ? "Saving..." : "Record Payment"}
                    </button>
                  </form>
                </div>
              ))}

              {filteredInvoices.length === 0 ? <div className="text-sm text-slate-500">No invoices match the current filters.</div> : null}
            </div>
          )}
        </Panel>

        <Panel title="Invoice Detail" description="Selected billing context including the linked report and remaining balance.">
          {selectedInvoice ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{selectedInvoice.invoice_number || `Invoice #${selectedInvoice.id}`}</div>
                    <div className="mt-1 text-sm text-slate-600">{selectedInvoice.lead?.name || selectedInvoice.lead?.profile_name || `Lead #${selectedInvoice.lead_id ?? "-"}`}</div>
                  </div>
                  <StatusBadge value={selectedInvoice.status} />
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <div>Clinic: {selectedInvoice.clinic?.name || `Clinic #${selectedInvoice.clinic_id ?? "-"}`}</div>
                  <div>Issued: {formatLocalDateTime(selectedInvoice.issued_at)}</div>
                  <div>Total Cost: {selectedInvoice.total_cost ?? 0}</div>
                  <div>Amount Paid: {selectedInvoice.amount_paid ?? 0}</div>
                  <div>Remaining: {Math.max((selectedInvoice.total_cost ?? 0) - (selectedInvoice.amount_paid ?? 0), 0)}</div>
                  <div>Treatment Plan: {selectedInvoice.treatment_plan_id ?? "-"}</div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                <div className="text-sm font-semibold text-slate-950">Linked Report</div>
                {selectedInvoice.report ? (
                  <div className="mt-3 grid gap-3 text-sm text-slate-600">
                    <div>Diagnosis: {selectedInvoice.report.diagnosis || "-"}</div>
                    <div>Treatment Notes: {selectedInvoice.report.treatment_notes || "-"}</div>
                    <div>Summary: {selectedInvoice.report.body || "-"}</div>
                    <div>Supplies Used: {(selectedInvoice.report.supplies_used?.length ?? 0) || "-"}</div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">This invoice is not currently linked to a loaded report payload.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Select an invoice to inspect its billing context.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
