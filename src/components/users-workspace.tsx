"use client";

import { FormEvent, type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Role, User } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { StatCard } from "@/components/stat-card";

type UserForm = {
  name: string;
  email: string;
  password: string;
  title: string;
  phone_number: string;
  location: string;
  specialization: string;
  salary: string;
  hired_at: string;
  whatsapp_agent_number: string;
  work_start: string;
  work_end: string;
  is_active: boolean;
  roles: number[];
};

const initialForm: UserForm = {
  name: "",
  email: "",
  password: "",
  title: "",
  phone_number: "",
  location: "",
  specialization: "",
  salary: "",
  hired_at: "",
  whatsapp_agent_number: "",
  work_start: "",
  work_end: "",
  is_active: true,
  roles: [],
};

const PROTECTED_ADMIN_EMAIL = "super@clinic.com";

function toForm(user?: User | null): UserForm {
  if (!user) {
    return initialForm;
  }

  return {
    name: user.name || "",
    email: user.email || "",
    password: "",
    title: user.title || "",
    phone_number: user.phone_number || "",
    location: user.location || "",
    specialization: user.specialization || "",
    salary: user.salary != null ? String(user.salary) : "",
    hired_at: user.hired_at ? user.hired_at.slice(0, 10) : "",
    whatsapp_agent_number: user.whatsapp_agent_number || "",
    work_start: user.work_start || "",
    work_end: user.work_end || "",
    is_active: user.is_active ?? true,
    roles: (user.roles || []).map((role) => role.id),
  };
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function buildUserPayload(form: UserForm, includePassword: boolean) {
  const payload: Record<string, string | number | boolean | number[] | null> = {
    name: form.name,
    email: form.email,
    title: form.title || null,
    phone_number: form.phone_number || null,
    location: form.location || null,
    specialization: form.specialization || null,
    salary: form.salary ? Number(form.salary) : null,
    hired_at: form.hired_at || null,
    whatsapp_agent_number: form.whatsapp_agent_number || null,
    work_start: form.work_start || null,
    work_end: form.work_end || null,
    is_active: form.is_active,
    roles: form.roles,
  };

  if (includePassword && form.password) {
    payload.password = form.password;
  }

  return payload;
}

function normalizeRoles(ids: number[]) {
  return [...ids].sort((a, b) => a - b);
}

function arraysEqual(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function UsersWorkspace() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<UserForm>(initialForm);
  const [editForm, setEditForm] = useState<UserForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      if (!term) {
        return true;
      }

      const roleNames = (user.roles || []).map((role) => role.name).join(" ");
      return [user.name, user.email, user.title, user.phone_number, roleNames, String(user.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, users]);

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId) ?? null, [selectedId, users]);

  const selectedUserIsProtectedAdmin = selectedUser?.email === PROTECTED_ADMIN_EMAIL;

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.is_active ?? true).length,
      withRoles: users.filter((user) => (user.roles || []).length > 0).length,
      specialties: new Set(users.map((user) => user.specialization).filter(Boolean)).size,
    }),
    [users],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [usersPayload, rolesPayload] = await Promise.all([
        fetchCollection<User>("/users"),
        fetchCollection<Role>("/roles"),
      ]);
      setUsers(usersPayload);
      setRoles(rolesPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
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
    setEditForm(toForm(selectedUser));
  }, [selectedUser]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<User>("/users", "POST", buildUserPayload(createForm, true));
      setCreateForm(initialForm);
      setNotice("User created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      const originalForm = toForm(selectedUser);
      const profileChanged =
        editForm.name !== originalForm.name ||
        editForm.email !== originalForm.email ||
        editForm.password !== "" ||
        editForm.title !== originalForm.title ||
        editForm.phone_number !== originalForm.phone_number ||
        editForm.location !== originalForm.location ||
        editForm.specialization !== originalForm.specialization ||
        editForm.salary !== originalForm.salary ||
        editForm.hired_at !== originalForm.hired_at ||
        editForm.whatsapp_agent_number !== originalForm.whatsapp_agent_number ||
        editForm.work_start !== originalForm.work_start ||
        editForm.work_end !== originalForm.work_end ||
        editForm.is_active !== originalForm.is_active;

      const rolesChanged = !arraysEqual(normalizeRoles(editForm.roles), normalizeRoles(originalForm.roles));

      let mergedUser: User = selectedUser;

      if (profileChanged) {
        const updatedUser = await mutateJson<User>(`/users/${selectedUser.id}`, "PATCH", buildUserPayload(editForm, Boolean(editForm.password)));
        mergedUser = {
          ...mergedUser,
          ...updatedUser,
          roles: updatedUser.roles ?? mergedUser.roles ?? [],
        };
      }

      if (rolesChanged) {
        const roleSyncedUser = await mutateJson<User>(`/users/${selectedUser.id}/roles`, "PATCH", {
          roles: editForm.roles,
        });

        mergedUser = {
          ...mergedUser,
          ...roleSyncedUser,
          roles: roleSyncedUser.roles ?? mergedUser.roles ?? [],
        };
      }

      setUsers((current) => current.map((user) => (user.id === selectedUser.id ? { ...user, ...mergedUser } : user)));
      setNotice(`User "${editForm.name}" updated successfully.`);
      setEditForm(toForm(mergedUser));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteUser(userId: number) {
    setDeletingId(userId);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/users/${userId}`);
      setNotice(`User #${userId} deleted successfully.`);
      if (selectedId === userId) {
        setSelectedId(null);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete user.");
    } finally {
      setDeletingId(null);
    }
  }

  function renderRolePicker(form: UserForm, setForm: Dispatch<SetStateAction<UserForm>>) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-slate-700">Roles</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => {
            const active = form.roles.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, roles: toggleId(current.roles, role.id) }))}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {role.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function openUserDetails(id: number) {
    setSelectedId(id);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create team accounts, assign access, and keep operational user records complete enough for CRM, visits, and clinic setup."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Users" value={stats.total} hint="Every account returned by the API." />
        <StatCard label="Active Users" value={stats.active} hint="Currently active team members." />
        <StatCard label="With Roles" value={stats.withRoles} hint="Accounts already tied to role bundles." />
        <StatCard label="Specialties" value={stats.specialties} hint="Distinct specialization labels across the team." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="User Directory" description="Search the team roster, then open a focused popup to review or edit the account.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="user-search" value={search} onChange={setSearch} placeholder="Name, email, title, role, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading users...</div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const active = selectedUser?.id === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => openUserDetails(user.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${active ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{user.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{user.email}</div>
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${(user.is_active ?? true) ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {(user.is_active ?? true) ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {(user.roles || []).map((role) => (
                        <span key={role.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                          {role.name}
                        </span>
                      ))}
                      {user.email === PROTECTED_ADMIN_EMAIL ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                          Protected admin
                        </span>
                      ) : null}
                      {user.title ? <span>{user.title}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create User" description="Create the account first, then role and profile details can be adjusted anytime.">
            <form className="space-y-4" onSubmit={createUser}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Name" name="create-user-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
                <WorkflowInput label="Email" name="create-user-email" value={createForm.email} onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))} type="email" required />
                <WorkflowInput label="Password" name="create-user-password" value={createForm.password} onChange={(value) => setCreateForm((current) => ({ ...current, password: value }))} type="password" required />
                <WorkflowInput label="Title" name="create-user-title" value={createForm.title} onChange={(value) => setCreateForm((current) => ({ ...current, title: value }))} />
                <WorkflowInput label="Phone" name="create-user-phone" value={createForm.phone_number} onChange={(value) => setCreateForm((current) => ({ ...current, phone_number: value }))} />
                <WorkflowInput label="Location" name="create-user-location" value={createForm.location} onChange={(value) => setCreateForm((current) => ({ ...current, location: value }))} />
                <WorkflowInput label="Specialization" name="create-user-specialization" value={createForm.specialization} onChange={(value) => setCreateForm((current) => ({ ...current, specialization: value }))} />
                <WorkflowInput label="WhatsApp Number" name="create-user-whatsapp" value={createForm.whatsapp_agent_number} onChange={(value) => setCreateForm((current) => ({ ...current, whatsapp_agent_number: value }))} />
              </div>
              {renderRolePicker(createForm, setCreateForm)}
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create User"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedUser.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedUser.email}</div>
                <div className="mt-2 text-xs text-slate-500">Joined {formatLocalDateTime(selectedUser.hired_at)}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Status" value={(selectedUser.is_active ?? true) ? "Active" : "Inactive"} hint="Current account status." />
                <StatCard label="Roles" value={(selectedUser.roles || []).length} hint="Assigned roles." />
                <StatCard label="Specialization" value={selectedUser.specialization || "-"} hint="Configured specialization." />
                <StatCard label="Phone" value={selectedUser.phone_number || "-"} hint="Primary phone number." />
              </div>

              <div className="mt-5">
                <Panel title="User Details" description="Update operational details and role assignment for this account without leaving the directory.">
                  <form className="space-y-4" onSubmit={updateUser}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowInput label="Name" name="edit-user-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                      <WorkflowInput label="Email" name="edit-user-email" value={editForm.email} onChange={(value) => setEditForm((current) => ({ ...current, email: value }))} type="email" required />
                      <WorkflowInput label="Password" name="edit-user-password" value={editForm.password} onChange={(value) => setEditForm((current) => ({ ...current, password: value }))} type="password" placeholder="Leave blank to keep current password" />
                      <WorkflowInput label="Title" name="edit-user-title" value={editForm.title} onChange={(value) => setEditForm((current) => ({ ...current, title: value }))} />
                      <WorkflowInput label="Phone" name="edit-user-phone" value={editForm.phone_number} onChange={(value) => setEditForm((current) => ({ ...current, phone_number: value }))} />
                      <WorkflowInput label="Location" name="edit-user-location" value={editForm.location} onChange={(value) => setEditForm((current) => ({ ...current, location: value }))} />
                      <WorkflowInput label="Specialization" name="edit-user-specialization" value={editForm.specialization} onChange={(value) => setEditForm((current) => ({ ...current, specialization: value }))} />
                      <WorkflowInput label="Hired At" name="edit-user-hired-at" value={editForm.hired_at} onChange={(value) => setEditForm((current) => ({ ...current, hired_at: value }))} type="date" />
                      <WorkflowInput label="Salary" name="edit-user-salary" value={editForm.salary} onChange={(value) => setEditForm((current) => ({ ...current, salary: value }))} type="number" />
                      <WorkflowInput label="Work Start" name="edit-user-work-start" value={editForm.work_start} onChange={(value) => setEditForm((current) => ({ ...current, work_start: value }))} type="time" />
                      <WorkflowInput label="Work End" name="edit-user-work-end" value={editForm.work_end} onChange={(value) => setEditForm((current) => ({ ...current, work_end: value }))} type="time" />
                    </div>
                    <WorkflowInput label="WhatsApp Number" name="edit-user-whatsapp" value={editForm.whatsapp_agent_number} onChange={(value) => setEditForm((current) => ({ ...current, whatsapp_agent_number: value }))} placeholder="Optional routing number for WhatsApp agent workflows" />
                    {renderRolePicker(editForm, setEditForm)}
                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(event) => setEditForm((current) => ({ ...current, is_active: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Active account
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteUser(selectedUser.id)} disabled={selectedUserIsProtectedAdmin || deletingId === selectedUser.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {selectedUserIsProtectedAdmin ? "Protected Admin" : deletingId === selectedUser.id ? "Deleting..." : "Delete User"}
                      </button>
                    </div>
                  </form>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
