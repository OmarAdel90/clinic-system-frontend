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

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.id === selectedRecordId) ?? records.find((record) => record.id === selectedRecordId) ?? filteredRecords[0] ?? records[0] ?? null,
    [filteredRecords, records, selectedRecordId],
  );

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
    const leadRows = await fetchCollection<Lead>("/leads");
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
    setSelectedRecordId((current) => current ?? recordRows[0]?.id ?? null);
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

  async function refreshCurrentLead() {
    if (!selectedLeadId) {
      return;
    }

    await loadRecords(selectedLeadId);
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
      await uploadFile(`/leads/${createForm.lead_id}/medical-records`, formData);
      setCreateForm({ ...initialForm, lead_id: createForm.lead_id, type: createForm.type });
      setNotice("Medical record uploaded successfully.");
      await refreshCurrentLead();
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
      }
      await mutateFormData(`/medical-records/${selectedRecord.id}`, "PATCH", formData);
      setNotice(`Medical record #${selectedRecord.id} updated successfully.`);
      await refreshCurrentLead();
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
      setNotice(`Medical record #${id} deleted successfully.`);
      if (selectedRecordId === id) {
        setSelectedRecordId(null);
      }
      await refreshCurrentLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete medical record.");
    } finally {
      setDeletingId(null);
    }
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
        <Panel title="Record Library" description="Pick a lead, then review the files currently attached to that lead.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowSelect
              label="Lead"
              value={selectedLeadId}
              onChange={(value) => void changeLead(value)}
              options={leads.map((lead) => ({ label: describeLead(lead), value: lead.id }))}
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
                    onClick={() => setSelectedRecordId(record.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{record.original_name || `Record #${record.id}`}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>{record.type}</div>
                      </div>
                      <div className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>#{record.id}</div>
                    </div>
                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-2 ${active ? "text-slate-300" : "text-slate-500"}`}>
                      <div>{record.mime_type || "Unknown file type"}</div>
                      <div>{formatLocalDateTime(record.created_at)}</div>
                    </div>
                    {record.notes ? <div className={`mt-3 text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{record.notes}</div> : null}
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
              <WorkflowSelect label="Lead" value={createForm.lead_id} onChange={(value) => setCreateForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: describeLead(lead), value: lead.id }))} required emptyLabel="Select lead" />
              <WorkflowSelect label="Type" value={createForm.type} onChange={(value) => setCreateForm((current) => ({ ...current, type: value }))} options={[{ label: "Lab", value: "lab" }, { label: "X-Ray", value: "xray" }, { label: "Prescription", value: "prescription" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
              <WorkflowTextarea label="Notes" name="create-medical-record-notes" value={createForm.notes} onChange={(value) => setCreateForm((current) => ({ ...current, notes: value }))} placeholder="Optional context for this file" />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">File</span>
                <input type="file" onChange={onCreateFileChange} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900" required />
              </label>
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Uploading..." : "Upload Medical Record"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Record" description="Update the record metadata, replace the file if needed, or open the stored attachment.">
            {selectedRecord ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedRecord.original_name || `Record #${selectedRecord.id}`}</div>
                  <div className="mt-1 text-sm text-slate-600">{describeLead(selectedLead)}</div>
                  <div className="mt-2 text-xs text-slate-500">Uploaded {formatLocalDateTime(selectedRecord.created_at)}</div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void openProtectedFile(`/medical-records/${selectedRecord.id}/file`, "view", selectedRecord.original_name || undefined)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    View File
                  </button>
                  <button type="button" onClick={() => void openProtectedFile(`/medical-records/${selectedRecord.id}/download`, "download", selectedRecord.original_name || undefined)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Download File
                  </button>
                </div>

                <form className="space-y-4" onSubmit={updateRecord}>
                  <WorkflowSelect label="Type" value={editForm.type} onChange={(value) => setEditForm((current) => ({ ...current, type: value }))} options={[{ label: "Lab", value: "lab" }, { label: "X-Ray", value: "xray" }, { label: "Prescription", value: "prescription" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
                  <WorkflowTextarea label="Notes" name="edit-medical-record-notes" value={editForm.notes} onChange={(value) => setEditForm((current) => ({ ...current, notes: value }))} placeholder="Optional context for this file" />
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
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a medical record to inspect or edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
