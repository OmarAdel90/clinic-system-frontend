"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { LocaleToggle } from "@/components/locale-toggle";
import { useLocale } from "@/components/locale-provider";

export default function LoginPage() {
  const { isRTL, t } = useLocale();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-10">
      <div className="mx-auto mb-4 flex max-w-6xl justify-end">
        <LocaleToggle />
      </div>
      <div
        className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <section
          className={`flex flex-col justify-between rounded-[28px] border border-white/60 bg-slate-950 px-8 py-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] lg:px-10 lg:py-10 ${
            isRTL ? "lg:order-2 text-right" : ""
          }`}
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
              {t("Clinic System")}
            </p>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight">{t("Clinic operations")}</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
              {t("Leads, visits, stock, billing, and team access in one place.")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">{t("CRM Pipeline")}</p>
              <p className="mt-2 text-sm text-slate-300">{t("Lead intake, assignment, and agent follow-up.")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">{t("Clinical Visits")}</p>
              <p className="mt-2 text-sm text-slate-300">{t("Scheduling, completion, reports, and billing.")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">{t("Inventory Ops")}</p>
              <p className="mt-2 text-sm text-slate-300">{t("Warehouses, supplier transactions, and stock control.")}</p>
            </div>
          </div>
        </section>

        <section className={`flex items-center ${isRTL ? "lg:order-1" : ""}`}>
          <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <div className="mb-8">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("Sign In")}</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">{t("Open the operations workspace")}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("Continue with your email address or phone number.")}
              </p>
            </div>

            <Suspense fallback={<div className="text-sm text-slate-500">{t("Loading sign-in...")}</div>}>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
