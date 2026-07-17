"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { useLocale } from "@/components/locale-provider";

export function LoginForm() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await login(loginId, password);
      saveSession(payload);
      const nextPath = searchParams.get("next") || "/dashboard";
      router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="login">
          {t("Email or Phone")}
        </label>
        <input
          id="login"
          type="text"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          placeholder={t("Email address or phone number")}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          {t("Password")}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          placeholder={t("Enter your password")}
          required
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {submitting ? t("Signing In...") : t("Sign In")}
      </button>
    </form>
  );
}

