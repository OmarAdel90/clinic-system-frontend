"use client";

import type { LoginResponse, User } from "@/lib/types";

const TOKEN_KEY = "clinic_frontend_token";
const USER_KEY = "clinic_frontend_user";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getToken() {
  if (!isBrowser()) {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function saveSession(payload: LoginResponse) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, payload.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}

export function clearSession() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function hasRole(user: User | null, roleName: string) {
  return Boolean(user?.roles?.some((role) => role.name === roleName));
}

export function hasPermission(user: User | null, permissionName: string) {
  return Boolean(user?.permissions?.some((permission) => permission.name === permissionName));
}

export function canAccess(user: User | null, requiredPermissions?: string[]) {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  return requiredPermissions.some((permission) => hasPermission(user, permission));
}
