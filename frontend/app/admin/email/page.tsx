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
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-sm font-medium transition-all duration-300 ${toast.ok ? "bg-emerald-600 shadow-emerald-600/10" : "bg-rose-600 shadow-rose-600/10"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Email / SMTP Settings</h1>

        {saveError && (
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">
            <div className="flex-1">{saveError}</div>
          </div>
        )}

        {isDirty && (
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">
            <div className="flex-1">You have unsaved changes.</div>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Connection</h2>
          
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200" checked={form.emails_enabled} onChange={(e) => updateForm({ emails_enabled: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Enable email notifications</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Host</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.smtp_host} onChange={(e) => updateForm({ smtp_host: e.target.value })} placeholder="smtp.example.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Port</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className={`w-full max-w-[120px] border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none transition-all duration-200 ${!isPortValid ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500" : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"}`} value={form.smtp_port} onChange={(e) => updateForm({ smtp_port: e.target.value })} />
              {!isPortValid && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">Port must be between 1 and 65535</span>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Credentials & Sender</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Username</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.smtp_user} onChange={(e) => updateForm({ smtp_user: e.target.value })} placeholder="smtp-user@example.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Password</label>
            <div className="space-y-1.5">
              <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.smtp_pass} onChange={(e) => { updateForm({ smtp_pass: e.target.value }); setPwChanged(true); }} placeholder={form.password_set ? "••••••••" : "SMTP Password"} />
              {form.password_set && !pwChanged && (
                <span className="text-[10px] text-slate-400 block font-medium">(currently set)</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">From Address</label>
            <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.smtp_from} onChange={(e) => updateForm({ smtp_from: e.target.value })} placeholder="noreply@example.com" />
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending || !isPortValid} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10">
            {saveMutation.isPending ? "Saving…" : "Save Configuration"}
          </button>
        </div>

        <hr className="border-slate-200 dark:border-slate-800" />

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Send Test Email</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test the SMTP connection with the current saved settings.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md">
            <input type="email" className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="recipient@example.com" />
            <button type="button" onClick={handleTest} disabled={testing || !testRecipient} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap">
              {testing ? "Sending…" : "Send Test"}
            </button>
          </div>

          {testResult && (
            <div className={`rounded-r-lg p-4 text-sm max-w-md border-l-4 transition-all duration-200 shadow-sm ${testResult.success ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300" : "bg-rose-50 border-rose-500 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300"}`}>
              {testResult.success ? (
                <p className="font-semibold">✓ {testResult.message}</p>
              ) : (
                <p className="font-semibold">✗ {testResult.message}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
