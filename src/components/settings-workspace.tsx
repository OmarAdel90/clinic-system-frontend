"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, fetchResource, mutateJson } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { MetaSettingsPayload } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";

const SEEDED_ADMIN_EMAIL = "super@clinic.com";

type SecretFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function SecretField({ label, name, value, onChange, placeholder }: SecretFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <input
            name={name}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      </label>
    </div>
  );
}

function NoticeBanner({ message, tone }: { message: string; tone: "success" | "error" }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {message}
    </div>
  );
}

export function SettingsWorkspace() {
  const currentUser = useMemo(() => getUser(), []);
  const [settings, setSettings] = useState<MetaSettingsPayload | null>(null);
  const [facebookForm, setFacebookForm] = useState<MetaSettingsPayload["facebook_instagram"] | null>(null);
  const [whatsappForm, setWhatsappForm] = useState<MetaSettingsPayload["whatsapp"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [facebookNotice, setFacebookNotice] = useState<string | null>(null);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<"facebook" | "whatsapp" | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetchResource<MetaSettingsPayload>("/settings/meta");
        setSettings(response);
        setFacebookForm(response.facebook_instagram);
        setWhatsappForm(response.whatsapp);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "Unable to load settings.");
      } finally {
        setLoading(false);
      }
    }

    if (currentUser?.email === SEEDED_ADMIN_EMAIL) {
      void load();
      return;
    }

    setLoading(false);
  }, [currentUser?.email]);

  const webhookUrl = settings?.webhook_url ?? `${API_BASE_URL}/webhook/meta`;

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopyNotice("Webhook URL copied.");
      setTimeout(() => setCopyNotice(null), 2500);
    } catch {
      setCopyNotice("Unable to copy automatically.");
      setTimeout(() => setCopyNotice(null), 2500);
    }
  }

  async function saveFacebookInstagram() {
    if (!facebookForm) {
      return;
    }

    setSavingSection("facebook");
    setFacebookNotice(null);
    setFacebookError(null);

    try {
      const response = await mutateJson<MetaSettingsPayload>("/settings/meta/facebook-instagram", "PATCH", facebookForm);
      setSettings(response);
      setFacebookForm(response.facebook_instagram);
      setWhatsappForm((current) => current ? { ...current, api_version: response.whatsapp.api_version } : response.whatsapp);
      setFacebookNotice("Facebook and Instagram settings saved.");
    } catch (err) {
      setFacebookError(err instanceof Error ? err.message : "Unable to save Facebook settings.");
    } finally {
      setSavingSection(null);
    }
  }

  async function saveWhatsapp() {
    if (!whatsappForm) {
      return;
    }

    setSavingSection("whatsapp");
    setWhatsappNotice(null);
    setWhatsappError(null);

    try {
      const response = await mutateJson<MetaSettingsPayload>("/settings/meta/whatsapp", "PATCH", whatsappForm);
      setSettings(response);
      setWhatsappForm(response.whatsapp);
      setFacebookForm((current) => current ? { ...current, api_version: response.facebook_instagram.api_version } : response.facebook_instagram);
      setWhatsappNotice("WhatsApp settings saved.");
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : "Unable to save WhatsApp settings.");
    } finally {
      setSavingSection(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Loading seeded-admin controls..." />
      </div>
    );
  }

  if (currentUser?.email !== SEEDED_ADMIN_EMAIL) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="This area is reserved for the seeded admin account because it can overwrite live Meta credentials."
        />
        <Panel title="Access restricted" description="Sign in with the seeded admin account to manage Meta messaging credentials.">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Only <span className="font-semibold">{SEEDED_ADMIN_EMAIL}</span> can access this page.
          </div>
        </Panel>
      </div>
    );
  }

  if (pageError || !facebookForm || !whatsappForm) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Manage Meta messaging credentials and webhook verification values." />
        <Panel title="Unable to load settings" description="The backend did not return the seeded-admin settings payload.">
          <NoticeBanner message={pageError ?? "Unable to load settings."} tone="error" />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Enter and rotate Meta credentials here. Secrets are editable only from the seeded admin account and persist to the backend environment file."
      />

      <Panel
        title="Facebook & Instagram Messaging"
        description="Configure Messenger and Instagram DM credentials, app security values, and the shared verification token."
        actions={
          <button
            type="button"
            onClick={copyWebhookUrl}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Copy webhook URL
          </button>
        }
      >
        <div className="space-y-5">
          {copyNotice ? <NoticeBanner message={copyNotice} tone="success" /> : null}
          {facebookNotice ? <NoticeBanner message={facebookNotice} tone="success" /> : null}
          {facebookError ? <NoticeBanner message={facebookError} tone="error" /> : null}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Webhook URL</p>
                <p className="mt-2 break-all text-sm font-medium text-slate-900">{webhookUrl}</p>
              </div>
              <div className="grid gap-2 text-sm text-slate-600 md:text-right">
                <div className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${facebookForm.facebook_token_configured ? "bg-emerald-500" : "bg-slate-300"}`} />
                  Facebook token {facebookForm.facebook_token_configured ? "configured" : "missing"}
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${facebookForm.instagram_token_configured ? "bg-emerald-500" : "bg-slate-300"}`} />
                  Instagram token {facebookForm.instagram_token_configured ? "configured" : "optional"}
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${facebookForm.ads_token_configured ? "bg-emerald-500" : "bg-slate-300"}`} />
                  Meta ads token {facebookForm.ads_token_configured ? "configured" : "missing"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkflowInput
              label="Facebook Page ID"
              name="facebook-page-id"
              value={facebookForm.facebook_page_id}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, facebook_page_id: value } : current)}
              placeholder="1011856032011589"
            />
            <SecretField
              label="Facebook Page Access Token"
              name="facebook-page-access-token"
              value={facebookForm.facebook_page_access_token}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, facebook_page_access_token: value } : current)}
            />
            <SecretField
              label="Instagram Access Token"
              name="instagram-access-token"
              value={facebookForm.instagram_access_token}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, instagram_access_token: value } : current)}
              placeholder="Leave blank to reuse the Facebook token"
            />
            <SecretField
              label="Meta Ads Access Token"
              name="meta-ads-access-token"
              value={facebookForm.ads_access_token}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, ads_access_token: value } : current)}
              placeholder="Token used to read accessible ad accounts and campaigns"
            />
            <WorkflowSelect
              label="Selected Ad Account"
              value={facebookForm.selected_ad_account_id}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, selected_ad_account_id: value } : current)}
              options={(facebookForm.available_ad_accounts ?? []).map((account) => ({
                label: `${account.name}${account.currency ? ` | ${account.currency}` : ""}`,
                value: account.id,
              }))}
              emptyLabel={facebookForm.available_ad_accounts?.length ? "Choose an ad account" : "Save the ads token first to load accounts"}
            />
            <WorkflowInput
              label="App ID"
              name="meta-app-id"
              value={facebookForm.app_id}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, app_id: value } : current)}
            />
            <SecretField
              label="App Secret"
              name="meta-app-secret"
              value={facebookForm.app_secret}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, app_secret: value } : current)}
            />
            <SecretField
              label="Webhook Verify Token"
              name="facebook-verify-token"
              value={facebookForm.verify_token}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, verify_token: value } : current)}
            />
            <WorkflowInput
              label="API Version"
              name="facebook-api-version"
              value={facebookForm.api_version}
              onChange={(value) => setFacebookForm((current) => current ? { ...current, api_version: value } : current)}
              placeholder="v20.0"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveFacebookInstagram}
              disabled={savingSection === "facebook"}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {savingSection === "facebook" ? "Saving..." : "Save Facebook & Instagram Credentials"}
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        title="WhatsApp Business"
        description="Store the WhatsApp Cloud API access token and identifiers used by inbound and outbound WhatsApp messaging. WhatsApp uses the shared Meta webhook URL shown below."
      >
        <div className="space-y-5">
          {whatsappNotice ? <NoticeBanner message={whatsappNotice} tone="success" /> : null}
          {whatsappError ? <NoticeBanner message={whatsappError} tone="error" /> : null}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${whatsappForm.access_token_configured ? "bg-emerald-500" : "bg-slate-300"}`} />
              WhatsApp access token {whatsappForm.access_token_configured ? "is configured" : "is missing"}
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shared Meta webhook URL</p>
              <p className="break-all text-sm font-medium text-slate-900">{webhookUrl}</p>
              <p className="text-xs text-slate-500">This same callback URL is used for WhatsApp, Facebook, and Instagram webhook events.</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SecretField
              label="Access Token"
              name="whatsapp-access-token"
              value={whatsappForm.access_token}
              onChange={(value) => setWhatsappForm((current) => current ? { ...current, access_token: value } : current)}
            />
            <WorkflowInput
              label="Phone Number ID"
              name="whatsapp-phone-number-id"
              value={whatsappForm.phone_number_id}
              onChange={(value) => setWhatsappForm((current) => current ? { ...current, phone_number_id: value } : current)}
            />
            <WorkflowInput
              label="WABA ID"
              name="whatsapp-waba-id"
              value={whatsappForm.waba_id}
              onChange={(value) => setWhatsappForm((current) => current ? { ...current, waba_id: value } : current)}
            />
            <SecretField
              label="Webhook Verify Token"
              name="whatsapp-verify-token"
              value={whatsappForm.verify_token}
              onChange={(value) => setWhatsappForm((current) => current ? { ...current, verify_token: value } : current)}
            />
            <WorkflowInput
              label="API Version"
              name="whatsapp-api-version"
              value={whatsappForm.api_version}
              onChange={(value) => setWhatsappForm((current) => current ? { ...current, api_version: value } : current)}
              placeholder="v20.0"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveWhatsapp}
              disabled={savingSection === "whatsapp"}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {savingSection === "whatsapp" ? "Saving..." : "Save WhatsApp Credentials"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
