"use client";
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCollection, fetchResource, mutateJson } from "@/lib/api";
import type {
  AgentMetrics,
  Clinic,
  Conversation,
  FollowUp,
  LeadStatus,
  MessageRecord,
} from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";

function getConversationTitle(conversation: Conversation) {
  return conversation.lead?.name || conversation.lead?.profile_name || `Lead #${conversation.lead_id ?? conversation.id}`;
}

function getPlatformLabel(platform?: string | null) {
  if (!platform) return "Unknown channel";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getMessagePreview(rows: MessageRecord[]) {
  const latest = rows[rows.length - 1];
  return latest?.body || latest?.media_caption || latest?.type || "No messages loaded yet.";
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
};

function SearchableSelect({ label, value, onChange, options, placeholder }: SearchableSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(value === "all" ? "" : selectedOption?.label ?? value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value === "all" ? "" : selectedOption?.label ?? value);
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
          value={query}
          onChange={(event) => syncTypedValue(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!value || value === "all") {
                if (value === "all") {
                  setQuery("");
                }
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

export function AgentWorkspace() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<LeadStatus[]>([]);
  const [messages, setMessages] = useState<Record<number, MessageRecord[]>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadProfileName, setLeadProfileName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadStatusId, setLeadStatusId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [followupSearch, setFollowupSearch] = useState("");
  const [followupTiming, setFollowupTiming] = useState("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationPlatform, setConversationPlatform] = useState("all");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [assigningClinic, setAssigningClinic] = useState(false);
  const [completingFollowupId, setCompletingFollowupId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [threadRefreshing, setThreadRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const threadViewportRef = useRef<HTMLDivElement | null>(null);

  const filteredFollowups = useMemo(() => {
    const term = followupSearch.trim().toLowerCase();
    const now = new Date();

    return followups.filter((followup) => {
      const dueDate = followup.due_at ? new Date(followup.due_at) : null;
      const relative = formatRelativeDateLabel(followup.due_at).toLowerCase();
      const leadName = followup.conversation?.lead?.name || followup.conversation?.lead?.profile_name || "";
      const matchesSearch =
        term.length === 0 ||
        [leadName, followup.body, String(followup.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesTiming =
        followupTiming === "all" ||
        (followupTiming === "overdue" && dueDate && dueDate.getTime() < now.getTime()) ||
        (followupTiming === "today" && relative === "today") ||
        (followupTiming === "upcoming" && dueDate && dueDate.getTime() >= now.getTime() && relative !== "today");

      return matchesSearch && matchesTiming;
    });
  }, [followupSearch, followupTiming, followups]);

  const filteredConversations = useMemo(() => {
    const term = conversationSearch.trim().toLowerCase();
    const normalizedTerm = term.replace(/\D+/g, "");

    return conversations.filter((conversation) => {
      const leadName = conversation.lead?.name || "";
      const leadProfileName = conversation.lead?.profile_name || "";
      const phone = conversation.lead?.phone || "";
      const normalizedPhone = phone.replace(/\D+/g, "");
      const preview = getMessagePreview(messages[conversation.id] ?? []);
      const matchesSearch =
        term.length === 0 ||
        [leadName, leadProfileName, conversation.platform, String(conversation.id), phone, preview]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term)) ||
        (normalizedTerm.length > 0 && normalizedPhone.includes(normalizedTerm));
      const matchesPlatform = conversationPlatform === "all" || conversation.platform === conversationPlatform;

      return matchesSearch && matchesPlatform;
    });
  }, [conversationPlatform, conversationSearch, conversations, messages]);

  const selectedConversation = useMemo(
    () => filteredConversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations.find((conversation) => conversation.id === selectedConversationId) ?? filteredConversations[0] ?? conversations[0] ?? null,
    [conversations, filteredConversations, selectedConversationId],
  );

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    setLeadName(selectedConversation.lead?.name || "");
    setLeadProfileName(selectedConversation.lead?.profile_name || "");
    setLeadPhone(selectedConversation.lead?.phone || "");
    setLeadStatusId(selectedConversation.lead?.lead_status_id ? String(selectedConversation.lead.lead_status_id) : "");
    setClinicId(selectedConversation.lead?.clinic_id ? String(selectedConversation.lead.clinic_id) : "");

    if (!detailsOpen) {
      return;
    }

    if (messages[selectedConversation.id]) {
      return;
    }

    void loadMessages(selectedConversation.id);
  }, [detailsOpen, selectedConversation, messages]);

  useEffect(() => {
    const viewport = threadViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [selectedConversation?.id, selectedConversationId, messages]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadWorkspace({ silent: true });
    }, 45000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedConversation || !detailsOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadMessages(selectedConversation.id, { force: true, silent: true });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [detailsOpen, selectedConversation?.id]);

  async function loadWorkspace(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    }

    setError(null);
    try {
      const [metricsRow, followupRows, conversationRows, clinicRows, leadStatusRows] = await Promise.all([
        fetchResource<AgentMetrics>("/agent/metrics"),
        fetchCollection<FollowUp>("/agent/followups"),
        fetchCollection<Conversation>("/agent/conversations"),
        clinics.length === 0 ? fetchCollection<Clinic>("/clinics").catch(() => []) : Promise.resolve(clinics),
        leadStatuses.length === 0 ? fetchCollection<LeadStatus>("/lead-statuses").catch(() => []) : Promise.resolve(leadStatuses),
      ]);

      setMetrics(metricsRow);
      setFollowups(followupRows);
      setConversations(conversationRows);
      setClinics(clinicRows);
      setLeadStatuses(leadStatusRows);
      setSelectedConversationId((current) => {
        if (current && conversationRows.some((conversation) => conversation.id === current)) {
          return current;
        }

        return conversationRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agent workspace.");
    } finally {
      setRefreshing(false);
    }
  }

  function applyLeadPatchToConversation(leadId: number, patch: Partial<NonNullable<Conversation["lead"]>>) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.lead_id === leadId && conversation.lead
          ? {
              ...conversation,
              lead: {
                ...conversation.lead,
                ...patch,
                id: conversation.lead.id,
              },
            }
          : conversation,
      ),
    );
  }

  function updateConversationSnapshot(conversationId: number, rows: MessageRecord[]) {
    const latest = rows[rows.length - 1];

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unread_amount: 0,
              last_message_time: latest?.sent_at || latest?.created_at || conversation.last_message_time,
            }
          : conversation,
      ),
    );
  }

  async function loadMessages(conversationId: number, options?: { force?: boolean; silent?: boolean }) {
    if (options?.force) {
      setThreadRefreshing(true);
    } else if (!options?.silent) {
      setLoadingMessages(true);
    }
    if (!options?.silent) {
      setError(null);
    }

    try {
      const rows = await fetchCollection<MessageRecord>(`/agent/conversations/${conversationId}/messages`);
      setMessages((current) => ({ ...current, [conversationId]: rows }));
      updateConversationSnapshot(conversationId, rows);
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : "Unable to load conversation messages.");
      }
    } finally {
      setLoadingMessages(false);
      setThreadRefreshing(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || !composerBody.trim()) {
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await mutateJson<{ messages: MessageRecord[] }>("/agent/messages/send", "POST", {
        conversation_id: selectedConversation.id,
        body: composerBody.trim(),
      });

      setMessages((current) => ({
        ...current,
        [selectedConversation.id]: response.messages,
      }));
      updateConversationSnapshot(selectedConversation.id, response.messages);
      setComposerBody("");
      setNotice(`Message sent in conversation #${selectedConversation.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function completeFollowup(followupId: number) {
    setCompletingFollowupId(followupId);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<FollowUp>(`/agent/followups/${followupId}/complete`, "PATCH", {});
      setFollowups((current) => current.filter((followup) => followup.id !== followupId));
      setMetrics((current) =>
        current
          ? {
              ...current,
              completed_reminders: current.completed_reminders + 1,
              pending_reminders: Math.max(current.pending_reminders - 1, 0),
            }
          : current,
      );
      setNotice(`Follow-up #${followupId} marked complete.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete follow-up.");
    } finally {
      setCompletingFollowupId(null);
    }
  }

  async function handleLeadSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation?.lead?.id) {
      return;
    }

    setSavingLead(true);
    setError(null);
    setNotice(null);

    try {
      const updatedLead = await mutateJson<Conversation["lead"]>(`/leads/${selectedConversation.lead.id}`, "PATCH", {
        name: leadName || null,
        profile_name: leadProfileName || null,
        phone: leadPhone || null,
        lead_status_id: leadStatusId ? Number(leadStatusId) : null,
      });

      applyLeadPatchToConversation(selectedConversation.lead.id, updatedLead ?? {});
      setNotice(`Lead #${selectedConversation.lead.id} updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update lead.");
    } finally {
      setSavingLead(false);
    }
  }

  async function handleClinicAssign() {
    if (!selectedConversation?.lead?.id) {
      return;
    }

    setAssigningClinic(true);
    setError(null);
    setNotice(null);

    try {
      if (clinicId) {
        const response = await mutateJson<{ lead?: Conversation["lead"] }>(`/leads/${selectedConversation.lead.id}/assign-clinic`, "PATCH", {
            clinic_id: Number(clinicId),
          });

        const selectedClinic = clinics.find((clinic) => String(clinic.id) === clinicId) ?? null;
        applyLeadPatchToConversation(selectedConversation.lead.id, {
          ...(response?.lead ?? {}),
          clinic_id: Number(clinicId),
          clinic: selectedClinic,
        });
        setNotice("Clinic assigned successfully.");
      } else {
        const updatedLead = await mutateJson<Conversation["lead"]>(`/leads/${selectedConversation.lead.id}`, "PATCH", {
            clinic_id: null,
          });

        applyLeadPatchToConversation(selectedConversation.lead.id, updatedLead ?? { clinic_id: null, clinic: null });
        setNotice("Clinic assignment cleared.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update clinic assignment.");
    } finally {
      setAssigningClinic(false);
    }
  }

  function openConversation(conversationId: number) {
    setSelectedConversationId(conversationId);
    setDetailsOpen(true);
  }

  const selectedMessages = selectedConversation ? messages[selectedConversation.id] ?? [] : [];
  const platformOptions = Array.from(new Set(conversations.map((conversation) => conversation.platform).filter(Boolean))) as string[];
  const platformSelectOptions = [{ label: "All platforms", value: "all" }, ...platformOptions.map((platform) => ({ label: getPlatformLabel(platform), value: platform }))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Workspace"
        description={`Follow-ups, active conversations, and live performance metrics rendered in ${getBrowserTimeZone()}.`}
        actions={
          <button
            type="button"
            onClick={() => void loadWorkspace({ silent: true })}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <Panel title="Follow-Up Queue" description="Keep quick follow-up actions nearby without stealing space from the active thread.">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <WorkflowInput label="Search" name="followup-search" value={followupSearch} onChange={setFollowupSearch} placeholder="Lead name, note, or follow-up id" />
          <WorkflowSelect
            label="Timing"
            value={followupTiming}
            onChange={setFollowupTiming}
            options={[
              { label: "All follow-ups", value: "all" },
              { label: "Overdue", value: "overdue" },
              { label: "Today", value: "today" },
              { label: "Upcoming", value: "upcoming" },
            ]}
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
            {filteredFollowups.map((followup) => (
              <div key={followup.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-950">{followup.conversation?.lead?.name || `Lead #${followup.conversation?.lead_id ?? "-"}`}</div>
                    <p className="mt-2 text-sm text-slate-600">{followup.body || "No follow-up body provided."}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {followup.conversation?.id ? (
                      <button
                        type="button"
                        onClick={() => openConversation(followup.conversation?.id ?? 0)}
                        className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Thread
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void completeFollowup(followup.id)}
                      disabled={completingFollowupId === followup.id}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {completingFollowupId === followup.id ? "Completing..." : "Complete"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Due {formatLocalDateTime(followup.due_at)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{formatRelativeDateLabel(followup.due_at)}</span>
                </div>
              </div>
            ))}
          {filteredFollowups.length === 0 ? <div className="text-sm text-slate-500">No pending follow-ups match the current filters.</div> : null}
        </div>
      </Panel>

      <Panel title="Conversation Desk" description="Open a conversation popup, then work the thread and the lead from one place.">
        <div className="grid gap-4">
          <div>
                <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <WorkflowInput label="Search" name="conversation-search" value={conversationSearch} onChange={setConversationSearch} placeholder="Lead name or phone number" />
                  <SearchableSelect
                    label="Platform"
                    value={conversationPlatform}
                    onChange={setConversationPlatform}
                    options={platformSelectOptions}
                    placeholder="All platforms"
                  />
                </div>

                <div className="space-y-3">
                  {filteredConversations.map((conversation) => {
                    const active = selectedConversation?.id === conversation.id;
                    const preview = getMessagePreview(messages[conversation.id] ?? []);
                    const unread = conversation.unread_amount ?? 0;

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => openConversation(conversation.id)}
                        className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                            {getConversationTitle(conversation)}
                          </div>
                          <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                              <span>{getPlatformLabel(conversation.platform)}</span>
                              <span className="truncate">{conversation.lead?.phone || "No phone"}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusBadge value={conversation.lead_status || conversation.status || "active"} />
                            {unread > 0 ? <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${active ? "bg-white/15 text-white" : "bg-slate-900 text-white"}`}>{unread}</span> : null}
                          </div>
                        </div>
                        <div className={`mt-3 line-clamp-2 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>{preview}</div>
                        <div className={`mt-3 flex items-center justify-between text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>
                          <span>Last touch {formatLocalDateTime(conversation.last_message_time)}</span>
                          <span>{formatRelativeDateLabel(conversation.last_message_time)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredConversations.length === 0 ? <div className="text-sm text-slate-500">No assigned conversations match the current filters.</div> : null}
                </div>
          </div>
        </div>
      </Panel>

      {detailsOpen && selectedConversation ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold text-slate-950">{getConversationTitle(selectedConversation)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>{selectedConversation.lead?.phone || "No phone"}</span>
                  <span>{getPlatformLabel(selectedConversation.platform)}</span>
                  {selectedConversation.lead?.clinic?.name ? <span>{selectedConversation.lead.clinic.name}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedConversation.lead?.id) {
                      router.push(`/leads?lead=${selectedConversation.lead.id}`);
                    }
                  }}
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  View Lead
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[calc(92vh-82px)] overflow-y-auto px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                <div className="space-y-5">
                  <Panel title="Thread" description="Work the conversation in a full-width popup without leaving the queue.">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <StatusBadge value={selectedConversation.lead_status || selectedConversation.status || "active"} />
                      <button
                        type="button"
                        onClick={() => void loadMessages(selectedConversation.id, { force: true })}
                        className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {threadRefreshing ? "Refreshing..." : "Refresh Thread"}
                      </button>
                    </div>

                    <div className="mb-4 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                      <div>First touch: {formatLocalDateTime(selectedConversation.first_message_time)}</div>
                      <div>Last touch: {formatLocalDateTime(selectedConversation.last_message_time)}</div>
                      <div>Converted: {formatLocalDateTime(selectedConversation.converted_at)}</div>
                      <div>{formatRelativeDateLabel(selectedConversation.last_message_time)}</div>
                    </div>

                    <div ref={threadViewportRef} className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                      {loadingMessages ? <div className="text-sm text-slate-500">Loading messages...</div> : null}
                      {!loadingMessages && selectedMessages.length === 0 ? <div className="text-sm text-slate-500">No messages returned for this conversation yet.</div> : null}
                      {selectedMessages.map((message) => {
                        const outbound = message.direction === "outbound";
                        const stamp = message.sent_at || message.created_at;

                        return (
                          <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${outbound ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)] text-slate-900"}`}>
                              <div className="break-words text-sm leading-6">{message.body || message.media_caption || message.type || "Message"}</div>
                              {message.media_url ? (
                                <a href={message.media_url} target="_blank" rel="noreferrer" className={`mt-2 inline-flex text-xs underline ${outbound ? "text-slate-300" : "text-slate-500"}`}>
                                  Open media
                                </a>
                              ) : null}
                              <div className={`mt-2 text-[11px] ${outbound ? "text-slate-300" : "text-slate-500"}`}>
                                {outbound ? message.user?.name || "You" : "Lead"} | {message.status || message.type || "message"} | {formatLocalDateTime(stamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form className="mt-4 space-y-3 border-t border-[var(--line)] pt-4" onSubmit={handleSendMessage}>
                      <textarea
                        value={composerBody}
                        onChange={(event) => setComposerBody(event.target.value)}
                        rows={5}
                        placeholder="Type a reply to the selected conversation"
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">Replies are sent through the backend messaging service for this conversation. The active thread refreshes in place while the popup stays open.</div>
                        <button
                          type="submit"
                          disabled={sending || !composerBody.trim()}
                          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {sending ? "Sending..." : "Send Message"}
                        </button>
                      </div>
                    </form>
                  </Panel>
                </div>

                <div className="space-y-5">
                  <Panel title="Lead Actions" description="Update the lead and assign a clinic without leaving the conversation.">
                    <form className="space-y-4" onSubmit={handleLeadSave}>
                      <WorkflowInput label="Name" name="agent-lead-name" value={leadName} onChange={setLeadName} placeholder="Lead name" />
                      <WorkflowInput label="Profile Name" name="agent-lead-profile-name" value={leadProfileName} onChange={setLeadProfileName} placeholder="Profile name" />
                      <WorkflowInput label="Phone" name="agent-lead-phone" value={leadPhone} onChange={setLeadPhone} placeholder="Phone number" />
                      <WorkflowSelect
                        label="Lead Status"
                        value={leadStatusId}
                        onChange={setLeadStatusId}
                        options={leadStatuses.map((status) => ({ label: status.label, value: String(status.id) }))}
                        emptyLabel="Select status"
                      />
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={savingLead}
                          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {savingLead ? "Saving..." : "Save Lead"}
                        </button>
                      </div>
                    </form>
                  </Panel>

                  <Panel title="Clinic Assignment" description="Assign or clear the clinic directly from the agent workflow.">
                    <div className="space-y-4">
                      <WorkflowSelect
                        label="Clinic"
                        value={clinicId}
                        onChange={setClinicId}
                        options={clinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))}
                        emptyLabel="No clinic"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => void handleClinicAssign()}
                          disabled={assigningClinic}
                          className="flex-1 rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {assigningClinic ? "Saving..." : clinicId ? "Assign Clinic" : "Clear Clinic"}
                        </button>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
