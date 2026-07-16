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
import { PaginationControls } from "@/components/pagination-controls";

type InvoiceDetailsView = "overview" | "report" | "payment";

const INVOICES_PAGE_SIZE = 10;

export function InvoicesWorkspace() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<InvoiceDetailsView>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<number | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);

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
  const invoiceTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / INVOICES_PAGE_SIZE));
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * INVOICES_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICES_PAGE_SIZE);
  }, [filteredInvoices, invoicePage]);

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

  useEffect(() => {
    setInvoicePage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (invoicePage > invoiceTotalPages) {
      setInvoicePage(invoiceTotalPages);
    }
  }, [invoicePage, invoiceTotalPages]);

  async function submitPayment(event: FormEvent<HTMLFormElement>, invoiceId: number) {
    event.preventDefault();
    setActiveInvoice(invoiceId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/invoices/${invoiceId}/pay`, "PATCH", {
        amount: Number(payments[invoiceId] || 0),
      });
      setPayments((current) => ({ ...current, [invoiceId]: "" }));
      setDetailsNotice(`Payment recorded for invoice #${invoiceId}.`);
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to record payment.");
    } finally {
      setActiveInvoice(null);
    }
  }

  function openInvoiceDetails(invoiceId: number) {
    setSelectedInvoiceId(invoiceId);
    setSelectedView("overview");
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
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

      <div className="grid gap-6">
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
              {paginatedInvoices.map((invoice) => (
                <div key={invoice.id} className={`grid gap-4 rounded-xl border p-4 lg:grid-cols-[1fr_auto] ${selectedInvoice?.id === invoice.id ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                  <button type="button" onClick={() => openInvoiceDetails(invoice.id)} className="text-left">
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
              <PaginationControls page={invoicePage} totalPages={invoiceTotalPages} totalItems={filteredInvoices.length} pageSize={INVOICES_PAGE_SIZE} itemLabel="invoices" onPageChange={setInvoicePage} />
            </div>
          )}
        </Panel>
      </div>

      {detailsOpen && selectedInvoice ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedInvoice.invoice_number || `Invoice #${selectedInvoice.id}`}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedInvoice.lead?.name || selectedInvoice.lead?.profile_name || `Lead #${selectedInvoice.lead_id ?? "-"}`}</div>
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
                  { key: "report", label: "Report" },
                  { key: "payment", label: "Payment" },
                ].map((tab) => {
                  const active = selectedView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedView(tab.key as InvoiceDetailsView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              {selectedView === "overview" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Status" value={selectedInvoice.status || "-"} hint="Current invoice payment state." />
                    <StatCard label="Total" value={selectedInvoice.total_cost ?? 0} hint="Total billed amount." />
                    <StatCard label="Paid" value={selectedInvoice.amount_paid ?? 0} hint="Amount recorded so far." />
                    <StatCard label="Remaining" value={Math.max((selectedInvoice.total_cost ?? 0) - (selectedInvoice.amount_paid ?? 0), 0)} hint="Open balance left on this invoice." />
                  </div>

                  <Panel title="Invoice Context" description="Selected billing context including the linked clinic and treatment plan.">
                    <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                      <div>Clinic: {selectedInvoice.clinic?.name || `Clinic #${selectedInvoice.clinic_id ?? "-"}`}</div>
                      <div>Issued: {formatLocalDateTime(selectedInvoice.issued_at)}</div>
                      <div>Treatment Plan: {selectedInvoice.treatment_plan_id ?? "-"}</div>
                      <div>Lead: {selectedInvoice.lead?.name || selectedInvoice.lead?.profile_name || `Lead #${selectedInvoice.lead_id ?? "-"}`}</div>
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedView === "report" ? (
                <div className="space-y-5">
                  <Panel title="Linked Report" description="Clinical report and usage context attached to this invoice.">
                    {selectedInvoice.report ? (
                      <div className="grid gap-3 text-sm text-slate-600">
                        <div>Diagnosis: {selectedInvoice.report.diagnosis || "-"}</div>
                        <div>Treatment Notes: {selectedInvoice.report.treatment_notes || "-"}</div>
                        <div>Summary: {selectedInvoice.report.body || "-"}</div>
                        <div>Supplies Used: {(selectedInvoice.report.supplies_used?.length ?? 0) || "-"}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">This invoice is not currently linked to a loaded report payload.</div>
                    )}
                  </Panel>
                </div>
              ) : null}

              {selectedView === "payment" ? (
                <div className="space-y-5">
                  <Panel title="Record Payment" description="Apply a payment directly to the selected invoice.">
                    <form className="space-y-4" onSubmit={(event) => submitPayment(event, selectedInvoice.id)}>
                      <WorkflowInput
                        label="Payment Amount"
                        name={`detail-amount-${selectedInvoice.id}`}
                        type="number"
                        value={payments[selectedInvoice.id] ?? ""}
                        onChange={(value) =>
                          setPayments((current) => ({
                            ...current,
                            [selectedInvoice.id]: value,
                          }))
                        }
                        placeholder="0.00"
                        required
                      />
                      <button type="submit" disabled={activeInvoice === selectedInvoice.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {activeInvoice === selectedInvoice.id ? "Saving..." : "Record Payment"}
                      </button>
                    </form>
                  </Panel>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
