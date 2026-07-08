"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Invoice } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";

export function InvoicesWorkspace() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCollection<Invoice>("/invoices");
      setInvoices(rows);
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
        description="Track balances and record payments directly against the billing API."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <Panel
        title="Payment Queue"
        description="Use this view for quick payment updates without leaving the billing workspace."
      >
        {loading ? (
          <div className="text-sm text-slate-500">Loading invoices...</div>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 lg:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm font-semibold text-slate-950">
                      {invoice.invoice_number || `Invoice #${invoice.id}`}
                    </div>
                    <StatusBadge value={invoice.status} />
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Lead #{invoice.lead_id ?? "—"} • Clinic #{invoice.clinic_id ?? "—"}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                    <div>Total: {invoice.total_cost ?? 0}</div>
                    <div>Paid: {invoice.amount_paid ?? 0}</div>
                    <div>Issued: {invoice.issued_at ?? "—"}</div>
                  </div>
                </div>

                <form
                  className="flex min-w-[240px] flex-col gap-3"
                  onSubmit={(event) => submitPayment(event, invoice.id)}
                >
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
                  <button
                    type="submit"
                    disabled={activeInvoice === invoice.id}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {activeInvoice === invoice.id ? "Saving..." : "Record Payment"}
                  </button>
                </form>
              </div>
            ))}

            {invoices.length === 0 ? <div className="text-sm text-slate-500">No invoices yet.</div> : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
