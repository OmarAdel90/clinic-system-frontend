"use client";

import { FormEvent, type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Permission, Role } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { StatCard } from "@/components/stat-card";
import { PaginationControls } from "@/components/pagination-controls";

type RoleForm = {
  name: string;
  permissions: number[];
};

const initialForm: RoleForm = {
  name: "",
  permissions: [],
};

const ROLES_PAGE_SIZE = 10;

function formatPermissionLabel(value: string) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => {
      switch (segment.toLowerCase()) {
        case "crm":
          return "CRM";
        case "ssn":
          return "SSN";
        case "api":
          return "API";
        default:
          return segment.charAt(0).toUpperCase() + segment.slice(1);
      }
    })
    .join(" ");
}

function toForm(role?: Role | null): RoleForm {
  if (!role) {
    return initialForm;
  }

  return {
    name: role.name || "",
    permissions: (role.permissions || []).map((permission) => permission.id),
  };
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function RolesWorkspace() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [createForm, setCreateForm] = useState<RoleForm>(initialForm);
  const [editForm, setEditForm] = useState<RoleForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [rolePage, setRolePage] = useState(1);

  const filteredRoles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return roles.filter((role) => {
      if (!term) {
        return true;
      }

      const permissionLabels = (role.permissions || []).map((permission) => formatPermissionLabel(permission.name)).join(" ");
      return [role.name, role.guard_name, permissionLabels, String(role.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [roles, search]);

  const filteredPermissions = useMemo(() => {
    const term = permissionSearch.trim().toLowerCase();
    return permissions.filter((permission) => {
      if (!term) {
        return true;
      }

      return formatPermissionLabel(permission.name).toLowerCase().includes(term);
    });
  }, [permissionSearch, permissions]);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedId) ?? null, [roles, selectedId]);
  const roleTotalPages = Math.max(1, Math.ceil(filteredRoles.length / ROLES_PAGE_SIZE));
  const paginatedRoles = useMemo(() => {
    const start = (rolePage - 1) * ROLES_PAGE_SIZE;
    return filteredRoles.slice(start, start + ROLES_PAGE_SIZE);
  }, [filteredRoles, rolePage]);

  const stats = useMemo(
    () => ({
      total: roles.length,
      permissions: permissions.length,
      custom: roles.filter((role) => role.name !== "admin").length,
      configured: roles.filter((role) => (role.permissions || []).length > 0).length,
    }),
    [permissions.length, roles],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [rolesPayload, permissionsPayload] = await Promise.all([
        fetchCollection<Role>("/roles"),
        fetchCollection<Permission>("/permissions"),
      ]);
      setRoles(rolesPayload);
      setPermissions(permissionsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load roles.");
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
    setEditForm(toForm(selectedRole));
  }, [selectedRole]);

  useEffect(() => {
    setRolePage(1);
  }, [search]);

  useEffect(() => {
    if (rolePage > roleTotalPages) {
      setRolePage(roleTotalPages);
    }
  }, [rolePage, roleTotalPages]);

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<Role>("/roles", "POST", {
        name: createForm.name,
        permissions: createForm.permissions,
      });
      setCreateForm(initialForm);
      setNotice("Role created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create role.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRole) {
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson<Role>(`/roles/${selectedRole.id}`, "PATCH", {
        name: editForm.name,
      });
      await mutateJson<Role>(`/roles/${selectedRole.id}/permissions`, "PATCH", {
        permissions: editForm.permissions,
      });
      setDetailsNotice(`Role "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update role.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRole(roleId: number) {
    setDeletingId(roleId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/roles/${roleId}`);
      setDetailsNotice(`Role #${roleId} deleted successfully.`);
      if (selectedId === roleId) {
        setSelectedId(null);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete role.");
    } finally {
      setDeletingId(null);
    }
  }

  function renderPermissionPicker(form: RoleForm, setForm: Dispatch<SetStateAction<RoleForm>>) {
    return (
      <div className="space-y-3">
        <WorkflowInput
          label="Filter Permissions"
          name="permission-search"
          value={permissionSearch}
          onChange={setPermissionSearch}
          placeholder="Search friendly permission labels"
        />
        <div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
          {filteredPermissions.map((permission) => {
            const active = form.permissions.includes(permission.id);
            return (
              <button
                key={permission.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, permissions: toggleId(current.permissions, permission.id) }))}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                <div className="font-medium">{formatPermissionLabel(permission.name)}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function openRoleDetails(id: number) {
    setSelectedId(id);
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Shape the permission bundles that the rest of the system relies on, without hard-coding role names into workflow logic."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Roles" value={stats.total} hint="Every role returned by the API." />
        <StatCard label="Permissions" value={stats.permissions} hint="Available permission keys you can assign." />
        <StatCard label="Configured Roles" value={stats.configured} hint="Roles that already have permissions attached." />
        <StatCard label="Custom Roles" value={stats.custom} hint="Non-admin role count for daily operations." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Role Catalog" description="Search the role catalog, then open a focused popup to inspect or edit the permission bundle.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="role-search" value={search} onChange={setSearch} placeholder="Role, friendly permission, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading roles...</div>
          ) : (
            <div className="space-y-3">
              {paginatedRoles.map((role) => {
                const active = selectedRole?.id === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => openRoleDetails(role.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${active ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="break-words text-sm font-semibold text-slate-950">{role.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{(role.permissions || []).length} permissions</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(role.permissions || []).slice(0, 8).map((permission) => (
                        <span key={permission.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                          {formatPermissionLabel(permission.name)}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              <PaginationControls
                page={rolePage}
                totalPages={roleTotalPages}
                totalItems={filteredRoles.length}
                pageSize={ROLES_PAGE_SIZE}
                itemLabel="roles"
                onPageChange={setRolePage}
              />
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Role" description="Create the bundle and assign the permission set in one step.">
            <form className="space-y-4" onSubmit={createRole}>
              <WorkflowInput label="Role Name" name="create-role-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
              {renderPermissionPicker(createForm, setCreateForm)}
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Role"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedRole ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="break-words text-lg font-semibold text-slate-950">{selectedRole.name}</div>
                <div className="mt-1 text-sm text-slate-600">{(selectedRole.permissions || []).length} permissions assigned</div>
                <div className="mt-2 text-xs text-slate-500">Updated {formatLocalDateTime(selectedRole.updated_at)}</div>
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
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Role" value={selectedRole.name} hint="Role bundle name." />
                <StatCard label="Permissions" value={(selectedRole.permissions || []).length} hint="Assigned permissions." />
                <StatCard label="Updated" value={selectedRole.updated_at ? formatLocalDateTime(selectedRole.updated_at, { year: "numeric", month: "short", day: "numeric" }) : "-"} hint="Last update date." />
              </div>

              <div className="mt-5">
                <Panel title="Role Details" description="Rename the role and tune the permission matrix without leaving the catalog view.">
                  <form className="space-y-4" onSubmit={updateRole}>
                    <WorkflowInput label="Role Name" name="edit-role-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                    {renderPermissionPicker(editForm, setEditForm)}
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteRole(selectedRole.id)} disabled={deletingId === selectedRole.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingId === selectedRole.id ? "Deleting..." : "Delete Role"}
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
