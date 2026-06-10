"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { SmtpConfig, SmtpTestResult } from "@/lib/api";
import { emailKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";

type FormState = Omit<SmtpConfig, "smtp_port"> & { smtp_port: string };

const DEFAULT_FORM: FormState = {
  emails_enabled: false,
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
  password_set: false,
};

export default function EmailAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Test states
  const [testRecipient, setTestRecipient] = useState("");
  const [testResult, setTestResult] = useState<SmtpTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user && user.role !== "mod") router.replace("/dashboard");
  }, [user, router]);

  const { data } = useQuery({
    queryKey: emailKeys.config(),
    queryFn: () => api.get<SmtpConfig>("/settings/email").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      setForm({ ...data, smtp_port: String(data.smtp_port), smtp_pass: "" });
      setPwChanged(false);
      setIsDirty(false);
    }
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: (payload: SmtpConfig) => api.patch("/settings/email", payload),
    onSuccess: () => {
      setToast({ msg: "Configuration saved", ok: true });
      setSaveError(null);
      setPwChanged(false);
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: emailKeys.all });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed";
      setSaveError(msg);
    },
  });

  const portVal = parseInt(form.smtp_port);
  const isPortValid = !isNaN(portVal) && portVal >= 1 && portVal <= 65535;

  function handleSave() {
    if (!isPortValid) return;
    setSaveError(null);
    const payload: SmtpConfig = {
      ...form,
      smtp_port: portVal,
      smtp_pass: pwChanged ? form.smtp_pass : "",
    };
    saveMutation.mutate(payload);
  }

  async function handleTest() {
    if (!testRecipient) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<SmtpTestResult>("/settings/email/test", {
        to: testRecipient,
      });
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: "Test request failed" });
    } finally {
      setTesting(false);
    }
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }

  if (!user || user.role !== "mod") return null;

  return (
    <AppShell>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white text-sm ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Email / SMTP Settings</h1>

        {saveError && (
          <div className="bg-red-50 border border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded p-3 text-sm">
            {saveError}
          </div>
        )}

        {isDirty && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded p-3 text-sm">
            You have unsaved changes.
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Connection</h2>
          
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.emails_enabled} onChange={(e) => updateForm({ emails_enabled: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300">Enable email notifications</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Host</label>
              <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.smtp_host} onChange={(e) => updateForm({ smtp_host: e.target.value })} placeholder="smtp.example.com" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Port</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className={`w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 ${!isPortValid ? "border-red-500 focus:outline-red-500" : "dark:border-slate-600"}`} value={form.smtp_port} onChange={(e) => updateForm({ smtp_port: e.target.value })} />
              {!isPortValid && (
                <span className="text-[10px] text-red-500 block mt-1">Port must be between 1 and 65535</span>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Credentials & Sender</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Username</label>
            <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.smtp_user} onChange={(e) => updateForm({ smtp_user: e.target.value })} placeholder="smtp-user@example.com" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Password</label>
            <div className="space-y-1">
              <input type="password" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.smtp_pass} onChange={(e) => { updateForm({ smtp_pass: e.target.value }); setPwChanged(true); }} placeholder={form.password_set ? "••••••••" : "SMTP Password"} />
              {form.password_set && !pwChanged && (
                <span className="text-[10px] text-slate-400 block">(currently set)</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">From Address</label>
            <input type="email" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.smtp_from} onChange={(e) => updateForm({ smtp_from: e.target.value })} placeholder="noreply@example.com" />
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending || !isPortValid} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? "Saving…" : "Save Configuration"}
          </button>
        </div>

        <hr className="border-slate-200 dark:border-slate-700" />

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Send Test Email</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test the SMTP connection with the current saved settings.
          </p>
          <div className="flex gap-2 max-w-md">
            <input type="email" className="flex-1 border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="recipient@example.com" />
            <button type="button" onClick={handleTest} disabled={testing || !testRecipient} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-50">
              {testing ? "Sending…" : "Send Test"}
            </button>
          </div>

          {testResult && (
            <div className={`rounded p-3 text-sm max-w-md ${testResult.success ? "bg-green-50 border border-green-300 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-50 border border-red-300 dark:bg-red-900/30 text-red-800 dark:text-red-300"}`}>
              {testResult.success ? (
                <p className="font-medium">✓ {testResult.message}</p>
              ) : (
                <p className="font-medium">✗ {testResult.message}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
