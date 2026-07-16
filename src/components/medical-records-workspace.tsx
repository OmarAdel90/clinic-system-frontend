"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL, fetchCollection, mutateFormData, removeResource, uploadFile } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Lead, MedicalRecord } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";

type MedicalRecordView = "overview" | "file" | "edit";

type MedicalRecordForm = {
  lead_id: string;
  type: string;
  notes: string;
  file: File | null;
};

const initialForm: MedicalRecordForm = {
  lead_id: "",
  type: "lab",
  notes: "",
  file: null,
};

function toForm(record?: MedicalRecord | null): MedicalRecordForm {
  if (!record) {
    return initialForm;
  }

  return {
    lead_id: String(record.lead_id ?? ""),
    type: record.type || "lab",
    notes: record.notes || "",
    file: null,
  };
}

function describeLead(lead?: Lead | null) {
  if (!lead) {
    return "";
  }

  return lead.name || lead.profile_name || lead.phone || `Lead #${lead.id}`;
}

async function openProtectedFile(path: string, disposition: "view" | "download", fileName?: string) {
  const token = getToken();
  if (!token) {
    throw new Error("Missing auth token.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to ${disposition} file.`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);

  if (disposition === "download") {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName || "medical-record";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } else {
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  }

  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

export function MedicalRecordsWorkspace() {
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("lead") || "";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leadFromQuery);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRecordView, setSelectedRecordView] = useState<MedicalRecordView>("overview");
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<MedicalRecordForm>({ ...initialForm, lead_id: leadFromQuery });
  const [editForm, setEditForm] = useState<MedicalRecordForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      const lead = leads.find((row) => row.id === record.lead_id);
      return (
        !term ||
        [record.type, record.notes, record.original_name, describeLead(lead), String(record.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    });
  }, [leads, records, search]);

  const selectedRecord = useMemo(() => records.find((record) => record.id === selectedRecordId) ?? null, [records, selectedRecordId]);

  const selectedLead = useMemo(
    () => leads.find((lead) => String(lead.id) === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const stats = useMemo(
    () => ({
      total: records.length,
      distinctLeads: new Set(records.map((record) => record.lead_id)).size,
      documents: records.filter((record) => record.mime_type?.includes("pdf") || record.mime_type?.includes("word") || record.mime_type?.includes("officedocument")).length,
      images: records.filter((record) => record.mime_type?.startsWith("image/")).length,
    }),
    [records],
  );

  async function loadLeads() {
    const leadRows = await fetchCollection<Lead>("/leads/picker?limit=200");
    const defaultLeadId = leadFromQuery || String(leadRows[0]?.id ?? "");
    setLeads(leadRows);
    setSelectedLeadId(defaultLeadId);
    setCreateForm((current) => ({ ...current, lead_id: current.lead_id || defaultLeadId }));
    return { leadRows, defaultLeadId };
  }

  async function loadRecords(leadId: string) {
    if (!leadId) {
      setRecords([]);
      setSelectedRecordId(null);
      return;
    }

      const recordRows = await fetchCollection<MedicalRecord>(`/leads/${leadId}/medical-records`);
      setRecords(recordRows);
      setSelectedRecordId((current) => (current && recordRows.some((record) => record.id === current) ? current : recordRows[0]?.id ?? null));
  }

  async function bootstrap() {
    setLoading(true);
    setError(null);

    try {
      const { defaultLeadId } = await loadLeads();
      if (defaultLeadId) {
        await loadRecords(defaultLeadId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load medical records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void bootstrap());
  }, [leadFromQuery]);

  useEffect(() => {
    setEditForm(toForm(selectedRecord));
  }, [selectedRecord]);

  function syncRecord(updatedRecord: MedicalRecord) {
    setRecords((current) => {
      const exists = current.some((record) => record.id === updatedRecord.id);
      if (!exists) {
        return [updatedRecord, ...current];
      }

      return current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record));
    });
  }

  async function changeLead(value: string) {
    setSelectedLeadId(value);
    setCreateForm((current) => ({ ...current, lead_id: value }));
    setError(null);
    setNotice(null);

    try {
      await loadRecords(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load records for selected lead.");
    }
  }

  function onCreateFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setCreateForm((current) => ({ ...current, file }));
  }

  function onEditFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setEditForm((current) => ({ ...current, file }));
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.lead_id || !createForm.file) {
      setError("Lead and file are required.");
      return;
    }

    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("type", createForm.type);
      formData.append("notes", createForm.notes);
      formData.append("file", createForm.file);
      const createdRecord = await uploadFile<MedicalRecord>(`/leads/${createForm.lead_id}/medical-records`, formData);
      syncRecord(createdRecord);
      setSelectedRecordId(createdRecord.id);
      setCreateForm({ ...initialForm, lead_id: createForm.lead_id, type: createForm.type });
      setNotice("Medical record uploaded successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload medical record.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecord) {
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("type", editForm.type);
      formData.append("notes", editForm.notes);
      if (editForm.file) {
        formData.append("file", editForm.file);
        const updatedRecord = await uploadFile<MedicalRecord>(`/medical-records/${selectedRecord.id}`, formData);
        syncRecord(updatedRecord);
      } else {
        const updatedRecord = await mutateFormData<MedicalRecord>(`/medical-records/${selectedRecord.id}`, "PATCH", formData);
        syncRecord(updatedRecord);
      }
      setNotice(`Medical record #${selectedRecord.id} updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update medical record.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRecord(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/medical-records/${id}`);
      setRecords((current) => current.filter((record) => record.id !== id));
      setNotice(`Medical record #${id} deleted successfully.`);
      if (selectedRecordId === id) {
        setSelectedRecordId(null);
        setDetailsOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete medical record.");
    } finally {
      setDeletingId(null);
    }
  }

  function openRecordDetails(id: number) {
    setSelectedRecordId(id);
    setSelectedRecordView("overview");
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Records"
        description="Attach clinical files to leads, keep notes beside each upload, and access the stored files without leaving the workspace."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Records" value={stats.total} hint="Medical records currently loaded for the selected visibility scope." />
        <StatCard label="Distinct Leads" value={stats.distinctLeads} hint="How many leads currently have a stored medical file." />
        <StatCard label="Documents" value={stats.documents} hint="PDF and office-style attachments in the current record set." />
        <StatCard label="Images" value={stats.images} hint="Image-based records such as scans and uploaded photos." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Record Library" description="Pick a lead, then open a focused popup to review the files currently attached to that lead.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowSelect
              label="Lead"
              value={selectedLeadId}
              onChange={(value) => void changeLead(value)}
              options={leads.map((lead) => ({ label: describeLead(lead), value: String(lead.id) }))}
              required
              emptyLabel="Select lead"
            />
            <WorkflowInput label="Search" name="medical-record-search" value={search} onChange={setSearch} placeholder="Type, file name, note, lead, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading medical records...</div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => openRecordDetails(record.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${active ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{record.original_name || `Record #${record.id}`}</div>
                        <div className="mt-1 text-sm text-slate-600">{record.type}</div>
                      </div>
                      <div className="text-xs text-slate-500">#{record.id}</div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                      <div>{record.mime_type || "Unknown file type"}</div>
                      <div>{formatLocalDateTime(record.created_at)}</div>
                    </div>
                    {record.notes ? <div className="mt-3 text-xs text-slate-500">{record.notes}</div> : null}
                  </button>
                );
              })}
              {filteredRecords.length === 0 ? <div className="text-sm text-slate-500">No medical records found for this lead.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Upload Record" description="Attach a new file to the selected lead. Supported files include PDF, images, and Office documents.">
            <form className="space-y-4" onSubmit={createRecord}>
              <WorkflowSelect label="Lead" value={createForm.lead_id} onChange={(value) => setCreateForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: describeLead(lead), value: String(lead.id) }))} required emptyLabel="Select lead" />
              <WorkflowSelect label="Type" value={createForm.type} onChange={(value) => setCreateForm((current) => ({ ...current, type: value }))} options={[{ label: "Lab", value: "lab" }, { label: "X-Ray", value: "xray" }, { label: "Prescription", value: "prescription" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
              <WorkflowTextarea label="Notes" value={createForm.notes} onChange={(value) => setCreateForm((current) => ({ ...current, notes: value }))} placeholder="Optional context for this file" />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">File</span>
                <input type="file" onChange={onCreateFileChange} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" required />
              </label>
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Uploading..." : "Upload Medical Record"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedRecord ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedRecord.original_name || `Record #${selectedRecord.id}`}</div>
                <div className="mt-1 text-sm text-slate-600">{describeLead(selectedLead)}</div>
                <div className="mt-2 text-xs text-slate-500">Uploaded {formatLocalDateTime(selectedRecord.created_at)}</div>
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
                  { key: "file", label: "File" },
                  { key: "edit", label: "Edit" },
                ].map((tab) => {
                  const active = selectedRecordView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedRecordView(tab.key as MedicalRecordView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-5 py-5">
              {selectedRecordView === "overview" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Type" value={selectedRecord.type} hint="Record category." />
                    <StatCard label="Lead" value={describeLead(selectedLead) || "-"} hint="Linked lead." />
                    <StatCard label="File Type" value={selectedRecord.mime_type || "-"} hint="Stored mime type." />
                    <StatCard label="Uploaded" value={selectedRecord.created_at ? formatLocalDateTime(selectedRecord.created_at, { year: "numeric", month: "short", day: "numeric" }) : "-"} hint="Upload date." />
                  </div>
                  <Panel title="Record Notes" description="Reference details stored with the uploaded file.">
                    <div className="text-sm text-slate-600">{selectedRecord.notes || "No notes recorded for this file."}</div>
                  </Panel>
                </div>
              ) : null}

              {selectedRecordView === "file" ? (
                <div className="space-y-5">
                <Panel title="File Access" description="Open the stored attachment directly or save a local copy.">
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => void openProtectedFile(`/medical-records/${selectedRecord.id}/file`, "view", selectedRecord.original_name || undefined)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      View File
                    </button>
                    <button type="button" onClick={() => void openProtectedFile(`/medical-records/${selectedRecord.id}/download`, "download", selectedRecord.original_name || undefined)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      Download File
                    </button>
                  </div>
                </Panel>
                </div>
              ) : null}

              {selectedRecordView === "edit" ? (
                <div className="space-y-5">
                <Panel title="Record Settings" description="Update the record metadata, replace the file if needed, or remove the record.">
                  <form className="space-y-4" onSubmit={updateRecord}>
                    <WorkflowSelect label="Type" value={editForm.type} onChange={(value) => setEditForm((current) => ({ ...current, type: value }))} options={[{ label: "Lab", value: "lab" }, { label: "X-Ray", value: "xray" }, { label: "Prescription", value: "prescription" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
                    <WorkflowTextarea label="Notes" value={editForm.notes} onChange={(value) => setEditForm((current) => ({ ...current, notes: value }))} placeholder="Optional context for this file" />
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Replace File</span>
                      <input type="file" onChange={onEditFileChange} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteRecord(selectedRecord.id)} disabled={deletingId === selectedRecord.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingId === selectedRecord.id ? "Deleting..." : "Delete Record"}
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

