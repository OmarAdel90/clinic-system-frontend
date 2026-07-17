"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchResource, mutateJson } from "@/lib/api";
import type { VisitReport } from "@/lib/types";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { PaginationControls } from "@/components/pagination-controls";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";

type PaginatedResponse<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

type ReportEditForm = {
  diagnosis: string;
  treatment_notes: string;
  body: string;
};

type ReportDetailsView = "overview" | "edit";

const initialEditForm: ReportEditForm = {
  diagnosis: "",
  treatment_notes: "",
  body: "",
};

function toEditForm(report?: VisitReport | null): ReportEditForm {
  if (!report) {
    return initialEditForm;
  }

  return {
    diagnosis: report.diagnosis || "",
    treatment_notes: report.treatment_notes || "",
    body: report.body || "",
  };
}

function displayLeadName(report: VisitReport) {
  return report.lead?.name || report.lead?.arabic_name || report.lead?.profile_name || `Lead #${report.lead_id ?? "-"}`;
}

function displayDoctorName(report: VisitReport) {
  return report.user?.name || report.user?.arabic_name || `User #${report.user_id ?? "-"}`;
}

export function ReportsWorkspace() {
  const [reports, setReports] = useState<VisitReport[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [clinicFilter, setClinicFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<ReportDetailsView>("overview");
  const [editForm, setEditForm] = useState<ReportEditForm>(initialEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);

  const clinicOptions = useMemo(
    () =>
      Array.from(new Map(
        reports
          .filter((report) => report.clinic?.id && report.clinic?.name)
          .map((report) => [String(report.clinic?.id), { label: report.clinic?.name || "", value: String(report.clinic?.id) }]),
      ).values()),
    [reports],
  );

  const doctorOptions = useMemo(
    () =>
      Array.from(new Map(
        reports
          .filter((report) => report.user?.id && (report.user?.name || report.user?.arabic_name))
          .map((report) => [String(report.user?.id), { label: report.user?.name || report.user?.arabic_name || "", value: String(report.user?.id) }]),
      ).values()),
    [reports],
  );

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const stats = useMemo(
    () => ({
      total,
      withInvoices: reports.filter((report) => Boolean(report.invoice?.id)).length,
      withSupplies: reports.filter((report) => (report.supplies_used?.length ?? 0) > 0).length,
      currentPageDoctors: new Set(reports.map((report) => report.user_id).filter(Boolean)).size,
    }),
    [reports, total],
  );

  async function load(targetPage = page) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        per_page: "10",
      });

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (clinicFilter) {
        params.set("clinic_id", clinicFilter);
      }

      if (doctorFilter) {
        params.set("user_id", doctorFilter);
      }

      const payload = await fetchResource<PaginatedResponse<VisitReport>>(`/reports?${params.toString()}`);
      setReports(payload.data);
      setPage(payload.current_page);
      setLastPage(payload.last_page);
      setPerPage(payload.per_page);
      setTotal(payload.total);
      setSelectedId((current) => current && payload.data.some((report) => report.id === current) ? current : payload.data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load(1);
    });
  }, [search, clinicFilter, doctorFilter]);

  useEffect(() => {
    setEditForm(toEditForm(selectedReport));
  }, [selectedReport]);

  useEffect(() => {
    setDetailsError(null);
    setDetailsNotice(null);
  }, [selectedId, detailsOpen]);

  async function updateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedReport) {
      return;
    }

    setSavingEdit(true);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      const updated = await mutateJson<VisitReport>(`/reports/${selectedReport.id}`, "PATCH", editForm);

      setReports((current) => current.map((report) => (report.id === updated.id ? updated : report)));
      setEditForm(toEditForm(updated));
      setDetailsNotice("Report updated successfully.");
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update report.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`Completed visit reports, doctor notes, and visit outcomes rendered in ${getBrowserTimeZone()}.`}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Reports" value={total} hint="Completed visit reports matching the current filters." />
        <StatCard label="With Invoice" value={stats.withInvoices} hint="Reports on this page already linked to an invoice." />
        <StatCard label="With Supplies" value={stats.withSupplies} hint="Reports that recorded actual supplies used." />
        <StatCard label="Doctors" value={stats.currentPageDoctors} hint="Distinct doctors represented in the current page." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title="Report Queue" description="Search completed reports by patient, phone number, clinic, doctor, visit number, or report content.">
          <div className="grid gap-3 md:grid-cols-3">
            <WorkflowInput label="Search" name="reports-search" value={search} onChange={setSearch} placeholder="Patient, phone, clinic, doctor, visit, diagnosis or notes" />
            <WorkflowSelect label="Clinic" value={clinicFilter} onChange={setClinicFilter} options={clinicOptions} emptyLabel="All clinics" />
            <WorkflowSelect label="Doctor" value={doctorFilter} onChange={setDoctorFilter} options={doctorOptions} emptyLabel="All doctors" />
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-sm text-slate-500">
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-sm text-slate-500">
                No reports matched the current filters.
              </div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(report.id);
                    setSelectedView("overview");
                    setDetailsOpen(true);
                  }}
                  className="block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{displayLeadName(report)}</div>
                      <div className="mt-1 truncate text-sm text-slate-600">
                        {report.clinic?.name || `Clinic #${report.clinic_id ?? "-"}`} • {displayDoctorName(report)}
                      </div>
                    </div>
                    <StatusBadge value={report.status || "completed"} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                    <div>{report.visit?.visit_number || `Visit #${report.visit_id ?? "-"}`}</div>
                    <div>{report.lead?.phone || "-"}</div>
                    <div>{formatLocalDateTime(report.visit_date || report.created_at)}</div>
                  </div>
                  {report.diagnosis ? (
                    <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{report.diagnosis}</div>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <PaginationControls
            page={page}
            totalPages={lastPage}
            totalItems={total}
            pageSize={perPage}
            itemLabel="reports"
            onPageChange={(targetPage) => {
              void load(targetPage);
            }}
          />
        </Panel>

        <Panel title="What lives here" description="Reports are created when a confirmed visit is completed by the doctor.">
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              Treatment plans still define the care path. Reports capture what actually happened during a completed visit.
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              This page is intentionally focused on reviewing and refining doctor notes, not re-running warehouse or billing logic after completion.
            </div>
          </div>
        </Panel>
      </div>

      {detailsOpen && selectedReport ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{displayLeadName(selectedReport)}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {selectedReport.clinic?.name || `Clinic #${selectedReport.clinic_id ?? "-"}`} • {displayDoctorName(selectedReport)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Completed {formatLocalDateTime(selectedReport.visit_date || selectedReport.created_at)}
                </div>
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
                  { key: "edit", label: "Edit" },
                ].map((tab) => {
                  const active = selectedView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedView(tab.key as ReportDetailsView)}
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
                    <StatCard label="Patient" value={displayLeadName(selectedReport)} hint="Lead/patient attached to this report." />
                    <StatCard label="Doctor" value={displayDoctorName(selectedReport)} hint="User who completed the visit." />
                    <StatCard label="Clinic" value={selectedReport.clinic?.name || `Clinic #${selectedReport.clinic_id ?? "-"}`} hint="Clinic where the visit happened." />
                    <StatCard label="Visit" value={selectedReport.visit?.visit_number || `Visit #${selectedReport.visit_id ?? "-"}`} hint="Visit reference linked to this report." />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
                    <Panel title="Clinical Summary" description="Doctor-authored diagnosis, notes, and report body.">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diagnosis</div>
                          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 leading-6">
                            {selectedReport.diagnosis || "No diagnosis recorded."}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Treatment Notes</div>
                          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 leading-6">
                            {selectedReport.treatment_notes || "No treatment notes recorded."}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Report Body</div>
                          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 leading-6">
                            {selectedReport.body || "No additional report body recorded."}
                          </div>
                        </div>
                      </div>
                    </Panel>

                    <div className="space-y-5">
                      <Panel title="Supplies Used" description="Actual consumables captured on the completed visit report.">
                        <div className="space-y-3">
                          {(selectedReport.supplies_used ?? []).length > 0 ? (
                            selectedReport.supplies_used?.map((item, index) => (
                              <div key={`${item.sku}-${index}`} className="grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-slate-700 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-900">{item.name || item.sku}</div>
                                  <div className="truncate text-xs text-slate-500">{item.sku}</div>
                                </div>
                                <div>Qty {item.quantity}</div>
                                <div>Unit {item.unit_price ?? 0}</div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-slate-500">
                              No supplies were captured on this report.
                            </div>
                          )}
                        </div>
                      </Panel>

                      <Panel title="Links" description="Related records connected to this completed visit.">
                        <div className="space-y-3 text-sm text-slate-700">
                          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                            Invoice: {selectedReport.invoice?.invoice_number || (selectedReport.invoice?.id ? `Invoice #${selectedReport.invoice.id}` : "Not generated")}
                          </div>
                          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                            Status: {selectedReport.status || "completed"}
                          </div>
                        </div>
                      </Panel>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedView === "edit" ? (
                <div className="space-y-5">
                  <Panel title="Edit Report Notes" description="Update the doctor-written summary without re-running stock or billing logic.">
                    {detailsError ? (
                      <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {detailsError}
                      </div>
                    ) : null}
                    {detailsNotice ? (
                      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {detailsNotice}
                      </div>
                    ) : null}
                    <form className="space-y-4" onSubmit={updateReport}>
                      <WorkflowTextarea label="Diagnosis" value={editForm.diagnosis} onChange={(value) => setEditForm((current) => ({ ...current, diagnosis: value }))} placeholder="Diagnosis summary" />
                      <WorkflowTextarea label="Treatment Notes" value={editForm.treatment_notes} onChange={(value) => setEditForm((current) => ({ ...current, treatment_notes: value }))} placeholder="Treatment notes" />
                      <WorkflowTextarea label="Report Body" value={editForm.body} onChange={(value) => setEditForm((current) => ({ ...current, body: value }))} placeholder="Additional doctor notes and outcome details" />
                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                          {savingEdit ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
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
