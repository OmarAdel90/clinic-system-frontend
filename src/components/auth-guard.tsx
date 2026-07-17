"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { clearSession, getToken, getUser, saveSession, canAccess } from "@/lib/auth";
import { navGroups } from "@/lib/navigation";
import type { NavItem, User } from "@/lib/types";

type AuthGuardProps = {
  children: (user: User) => React.ReactNode;
};

const SEEDED_ADMIN_EMAIL = "super@clinic.com";

function canUseNavItem(user: User | null, item: NavItem) {
  if (item.adminOnly && user?.email !== SEEDED_ADMIN_EMAIL) {
    return false;
  }

  return canAccess(user, item.permissions);
}

function findFirstAccessiblePath(user: User | null) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (canUseNavItem(user, item)) {
        return item.href;
      }
    }
  }

  return null;
}

function findMatchingNavItem(pathname: string) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item;
      }
    }
  }

  return null;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(() => getUser());
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const matchedItem = useMemo(() => findMatchingNavItem(pathname), [pathname]);

  useEffect(() => {
    async function bootstrap() {
      const token = getToken();
      if (!token) {
        router.replace("/login");
        setLoading(false);
        return;
      }

      try {
        const me = await fetchMe();
        saveSession({ token, user: me });
        setUser(me);
      } catch {
        clearSession();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [pathname, router]);

  useEffect(() => {
    if (loading || !user || !matchedItem) {
      return;
    }

    if (canUseNavItem(user, matchedItem)) {
      return;
    }

    const fallbackPath = findFirstAccessiblePath(user);
    router.replace(fallbackPath ?? "/login");
  }, [loading, matchedItem, router, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <div className="rounded-xl border border-[var(--line)] bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (matchedItem && !canUseNavItem(user, matchedItem)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <div className="rounded-xl border border-[var(--line)] bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          Loading workspace...
        </div>
      </div>
    );
  }

  return <>{children(user)}</>;
}
