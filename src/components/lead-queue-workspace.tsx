"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCollection, fetchResource, mutateJson, removeResource } from "@/lib/api";
import type { CallCenterQueueEntry, User } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { StatCard } from "@/components/stat-card";

type PaginatedResponse<T> = {
  data: T[];
};

export function LeadQueueWorkspace() {
  const [queue, setQueue] = useState<CallCenterQueueEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const queuedUserIds = useMemo(() => new Set(queue.map((entry) => entry.user_id)), [queue]);

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();

    return queue.filter((entry) => {
      if (!term) {
        return true;
      }

      return [entry.user?.name, entry.user?.email, entry.user?.phone_number, String(entry.position), String(entry.user_id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [queue, search]);

  const availableUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users
      .filter((user) => (user.is_active ?? true) && !queuedUserIds.has(user.id))
      .filter((user) => {
        if (!term) {
          return true;
        }

        return [user.name, user.email, user.phone_number, user.title, String(user.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
  }, [queuedUserIds, search, users]);

  const stats = useMemo(() => {
    const activeUsers = users.filter((user) => user.is_active ?? true).length;

    return {
      queued: queue.length,
      nextUp: queue[0]?.user?.name || queue[0]?.user?.email || "No one",
      available: availableUsers.length,
      activeUsers,
    };
  }, [availableUsers.length, queue, users]);

  async function load(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [queuePayload, usersPayload] = await Promise.all([
        fetchCollection<CallCenterQueueEntry>("/call-center/queue"),
        fetchResource<PaginatedResponse<User>>("/users?page=1&per_page=100").then((response) => response.data),
      ]);

      setQueue(
        [...queuePayload].sort((left, right) => {
          if (left.position !== right.position) {
            return left.position - right.position;
          }

          return left.id - right.id;
        }),
      );
      setUsers(usersPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the lead queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function addToQueue(userId: number) {
    setBusyUserId(userId);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/call-center/queue/add/${userId}`, "POST", {});
      const user = users.find((row) => row.id === userId);
      setNotice(`${user?.name || `User #${userId}`} added to the queue.`);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add user to queue.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeFromQueue(userId: number) {
    setBusyUserId(userId);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/call-center/queue/remove/${userId}`);
      const entry = queue.find((row) => row.user_id === userId);
      setNotice(`${entry?.user?.name || `User #${userId}`} removed from the queue.`);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove user from queue.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Queue"
        description="Manage the round-robin assignment order used when new leads arrive and get auto-routed to agents."
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
        <StatCard label="Queued Agents" value={stats.queued} hint="Active entries participating in round-robin lead assignment." />
        <StatCard label="Next Up" value={stats.nextUp} hint="The user who will receive the next incoming lead." />
        <StatCard label="Available Users" value={stats.available} hint="Active users not currently sitting in the queue." />
        <StatCard label="Active Users" value={stats.activeUsers} hint="All active user accounts returned by the API." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Current Queue" description="Users are processed from top to bottom. After assignment, the first user moves to the back automatically.">
          <div className="mb-4">
            <WorkflowInput
              label="Search"
              name="lead-queue-search"
              value={search}
              onChange={setSearch}
              placeholder="Name, email, phone, user id, or queue position"
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading queue...</div>
          ) : filteredQueue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No active queue entries match the current search.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQueue.map((entry, index) => {
                const nextUp = index === 0;
                const userName = entry.user?.name || entry.user?.email || `User #${entry.user_id}`;

                return (
                  <div key={entry.id} className={`rounded-xl border p-4 ${nextUp ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nextUp ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                            Position {entry.position}
                          </span>
                          {nextUp ? <span className="text-xs font-semibold text-emerald-200">Next lead</span> : null}
                        </div>
                        <div className="mt-3 text-sm font-semibold">{userName}</div>
                        <div className={`mt-1 text-sm ${nextUp ? "text-slate-200" : "text-slate-600"}`}>{entry.user?.email || "No email"}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void removeFromQueue(entry.user_id)}
                        disabled={busyUserId === entry.user_id}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${nextUp ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {busyUserId === entry.user_id ? "Removing..." : "Remove"}
                      </button>
                    </div>

                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-3 ${nextUp ? "text-slate-300" : "text-slate-500"}`}>
                      <div>User ID: {entry.user_id}</div>
                      <div>Phone: {entry.user?.phone_number || "Not set"}</div>
                      <div>Queued: {formatLocalDateTime(entry.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Add Users" description="Only active users who are not already in the queue appear here.">
          {loading ? (
            <div className="text-sm text-slate-500">Loading users...</div>
          ) : availableUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              Every active user is already queued, or no active users match the current search.
            </div>
          ) : (
            <div className="space-y-3">
              {availableUsers.map((user) => (
                <div key={user.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{user.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{user.email}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void addToQueue(user.id)}
                      disabled={busyUserId === user.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyUserId === user.id ? "Adding..." : "Add To Queue"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                    <div>User ID: {user.id}</div>
                    <div>Phone: {user.phone_number || "Not set"}</div>
                    <div>Title: {user.title || "No title"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
