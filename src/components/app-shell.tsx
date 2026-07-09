"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { canAccess, clearSession } from "@/lib/auth";
import { logout } from "@/lib/api";
import type { User } from "@/lib/types";

type AppShellProps = {
  user: User;
  children: React.ReactNode;
};

const DEPLOY_MARKER = "Build 2026-07-09S";

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Ignore logout transport errors and clear local auth anyway.
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Clinic System
              </p>
              <h1 className="mt-2 text-xl font-semibold text-slate-950">Operations CRM</h1>
              <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                {DEPLOY_MARKER}
              </div>
            </div>
            <div className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-slate-600">
              {user.roles?.[0]?.name ?? "staff"}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>

          <nav className="mt-4 space-y-1">
            {navItems.filter((item) => canAccess(user, item.permissions)).map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-4 py-3 transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-[var(--surface)]"
                  }`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div
                    className={`mt-1 text-xs ${
                      active ? "text-slate-200" : "text-slate-500"
                    }`}
                  >
                    {item.description}
                  </div>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign Out
          </button>
        </aside>

        <main className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow-soft)] lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}



