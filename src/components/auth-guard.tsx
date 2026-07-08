"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { clearSession, getToken, getUser, saveSession } from "@/lib/auth";
import type { User } from "@/lib/types";

type AuthGuardProps = {
  children: (user: User) => React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(() => getUser());
  const [loading, setLoading] = useState(() => Boolean(getToken()));

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

  if (loading || !user) {
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
