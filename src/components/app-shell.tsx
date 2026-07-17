"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navGroups } from "@/lib/navigation";
import { canAccess, clearSession } from "@/lib/auth";
import { logout } from "@/lib/api";
import type { User } from "@/lib/types";
import { LocaleToggle } from "@/components/locale-toggle";
import { useLocale } from "@/components/locale-provider";

type AppShellProps = {
  user: User;
  children: React.ReactNode;
};

const DEPLOY_MARKER = "Build 2026-07-09X";
const SEEDED_ADMIN_EMAIL = "super@clinic.com";

export function AppShell({ user, children }: AppShellProps) {
  const { isRTL, t } = useLocale();
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

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && user.email !== SEEDED_ADMIN_EMAIL) {
          return false;
        }

        return canAccess(user, item.permissions);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-slate-900">
      <div
        className={`mx-auto min-h-screen max-w-[1680px] px-3 py-3 lg:flex lg:gap-4 lg:px-5 ${
          isRTL ? "lg:flex-row-reverse" : ""
        }`}
      >
        <aside
          dir={isRTL ? "rtl" : "ltr"}
          className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow-soft)] lg:mb-0 lg:w-[300px] lg:flex-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
            <div className={isRTL ? "text-right" : ""}>
              <p
                lang={isRTL ? "ar" : "en"}
                dir={isRTL ? "rtl" : "ltr"}
                style={isRTL ? { unicodeBidi: "plaintext" } : undefined}
                className={`text-[11px] font-medium text-slate-500 ${
                  isRTL ? "" : "uppercase tracking-[0.18em]"
                }`}
              >
                {t("Clinic System")}
              </p>
              <h1
                lang={isRTL ? "ar" : "en"}
                dir={isRTL ? "rtl" : "ltr"}
                style={isRTL ? { unicodeBidi: "plaintext" } : undefined}
                className="mt-2 text-xl font-semibold text-slate-950"
              >
                {t("Operations CRM")}
              </h1>
              <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                {DEPLOY_MARKER}
              </div>
            </div>
            <div className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-slate-600">
              {user.roles?.[0]?.name ?? t("staff")}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>

          <nav className="mt-4 space-y-4" dir={isRTL ? "rtl" : "ltr"}>
            {visibleGroups.map((group) => (
              <div key={group.label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/70 p-2.5">
                <div
                  lang={isRTL ? "ar" : "en"}
                  dir={isRTL ? "rtl" : "ltr"}
                  style={isRTL ? { unicodeBidi: "plaintext" } : undefined}
                  className={`px-2 pb-2 text-[11px] font-semibold text-slate-500 ${isRTL ? "text-right" : "uppercase tracking-[0.14em]"}`}
                >
                  {t(group.label)}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const isNestedVisitItem = item.href === "/visits";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        dir={isRTL ? "rtl" : "ltr"}
                        className={`block rounded-lg border px-3 py-2.5 transition ${
                          active
                            ? "border-slate-900 bg-slate-900 shadow-sm"
                            : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                        } ${isNestedVisitItem ? `${isRTL ? "mr-4" : "ml-4"} bg-slate-50/80` : ""} ${isRTL ? "text-right" : ""}`}
                      >
                        <div className={isRTL ? "block w-full text-right" : "flex items-center gap-2"}>
                          {isNestedVisitItem ? (
                            <span className={`inline-block h-px w-3 ${active ? "bg-slate-200" : "bg-slate-300"} ${isRTL ? "hidden" : ""}`} />
                          ) : null}
                          <div
                            lang={isRTL ? "ar" : "en"}
                            dir={isRTL ? "rtl" : "ltr"}
                            style={isRTL ? { unicodeBidi: "isolate" } : undefined}
                            className={`${active ? "text-white" : "text-slate-800"} text-sm font-medium ${
                              isNestedVisitItem ? "text-[13px]" : ""
                            } ${isRTL ? "block w-full text-right" : ""}`}
                          >
                            {t(item.label)}
                          </div>
                        </div>
                        <div
                          lang={isRTL ? "ar" : "en"}
                          dir={isRTL ? "rtl" : "ltr"}
                          style={isRTL ? { unicodeBidi: "isolate" } : undefined}
                          className={`mt-1 leading-5 ${active ? "text-slate-200" : "text-slate-500"} ${
                            isNestedVisitItem ? `${isRTL ? "pr-5" : "pl-5"} text-[11px]` : "text-[11px]"
                          } ${isRTL ? "block w-full text-right" : ""}`}
                        >
                          {t(item.description)}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {t("Sign Out")}
          </button>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow-soft)] lg:flex-1 lg:p-6">
          <div className="mb-4 flex justify-end">
            <LocaleToggle compact />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
