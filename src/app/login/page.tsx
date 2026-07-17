import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between rounded-[28px] border border-white/60 bg-slate-950 px-8 py-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] lg:px-10 lg:py-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
              Clinic System
            </p>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight">
              A modern CRM workspace for clinics, care teams, and operations.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
              Manage leads, appointments, warehouse stock, invoices, suppliers, and role-based staff
              access from one focused control surface.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">CRM Pipeline</p>
              <p className="mt-2 text-sm text-slate-300">Lead intake, assignment, and agent follow-up.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Clinical Visits</p>
              <p className="mt-2 text-sm text-slate-300">Scheduling, completion, reports, and billing.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Inventory Ops</p>
              <p className="mt-2 text-sm text-slate-300">Warehouses, supplier transactions, and stock control.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <div className="mb-8">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Sign In</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">Open the operations workspace</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use your assigned email address or phone number to continue into the clinic workspace.
              </p>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Access is role-based. Inactive accounts are blocked automatically, and only permitted sections appear after sign-in.
            </div>

            <Suspense fallback={<div className="text-sm text-slate-500">Loading sign-in...</div>}>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
