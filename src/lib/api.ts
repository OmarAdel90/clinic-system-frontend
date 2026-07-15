"use client";

import { clearSession, getToken } from "@/lib/auth";
import type { ApiRecord, LoginResponse, User } from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://undergrow.online/clinic-backend/api";

type RequestOptions = {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ?? null,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }

    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

export async function login(login: string, password: string) {
  return request<LoginResponse>("/login", {
    method: "POST",
    auth: false,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ login, password }),
  });
}

export async function logout() {
  return request<{ message: string }>("/logout", {
    method: "POST",
  });
}

export async function fetchMe() {
  return request<User>("/me");
}

export async function fetchResource<T>(path: string) {
  return request<T>(path);
}

export async function fetchCollection<T extends ApiRecord>(path: string) {
  return request<T[]>(path);
}

export async function mutateJson<T>(path: string, method: string, body: ApiRecord) {
  return request<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function uploadFile<T>(path: string, formData: FormData) {
  return request<T>(path, {
    method: "POST",
    body: formData,
  });
}

export async function mutateFormData<T>(path: string, method: string, formData: FormData) {
  return request<T>(path, {
    method,
    body: formData,
  });
}

export async function removeResource(path: string) {
  return request<null>(path, {
    method: "DELETE",
  });
}

export { API_BASE_URL };
