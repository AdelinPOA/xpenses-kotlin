"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ImapConfig, ImapTestResult } from "@/lib/api";
import { imapKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";

type FormState = Omit<ImapConfig, "imap_port"> & { imap_port: string };

const DEFAULT_FORM: FormState = {
  enabled: false,
  imap_host: "",
  imap_port: "993",
  imap_user: "",
  imap_pass: "",
  imap_folder: "INBOX",
  password_set: false,
};

export default function ImapAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Test connection states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ImapTestResult | null>(null);

  useEffect(() => {
    if (user && user.role !== "mod") router.replace("/dashboard");
  }, [user, router]);

  const { data } = useQuery({
    queryKey: imapKeys.config(),
    queryFn: () => api.get<ImapConfig>("/settings/imap").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      setForm({ ...data, imap_port: String(data.imap_port), imap_pass: "" });
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
    mutationFn: (payload: ImapConfig) => api.patch("/settings/imap", payload),
    onSuccess: () => {
      setToast({ msg: "Configuration saved", ok: true });
      setSaveError(null);
      setPwChanged(false);
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: imapKeys.all });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Save failed";
      setSaveError(msg);
    },
  });

  const portVal = parseInt(form.imap_port);
  const isPortValid = !isNaN(portVal) && portVal >= 1 && portVal <= 65535;

  function handleSave() {
    if (!isPortValid) return;
    setSaveError(null);
    const payload: ImapConfig = {
      ...form,
      imap_port: portVal,
      imap_pass: pwChanged ? form.imap_pass : "",
    };
    saveMutation.mutate(payload);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        ...form,
        imap_port: portVal,
        imap_pass: pwChanged ? form.imap_pass : "",
      };
      const res = await api.post<ImapTestResult>("/settings/imap/test", payload);
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: "Test connection request failed." });
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
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-sm font-medium transition-all duration-300 ${
            toast.ok ? "bg-emerald-600 shadow-emerald-600/10" : "bg-rose-600 shadow-rose-600/10"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          IMAP Ingestion Settings (Delegation Emails)
        </h1>

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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Connection
          </h2>

          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
              checked={form.enabled}
              onChange={(e) => updateForm({ enabled: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Enable IMAP polling for delegation emails
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">IMAP Host</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                value={form.imap_host}
                onChange={(e) => updateForm({ imap_host: e.target.value })}
                placeholder="imap.company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">IMAP Port</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`w-full max-w-[120px] border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none transition-all duration-200 ${
                  !isPortValid
                    ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                }`}
                value={form.imap_port}
                onChange={(e) => updateForm({ imap_port: e.target.value })}
              />
              {!isPortValid && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">
                  Port must be between 1 and 65535
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Folder to poll</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
              value={form.imap_folder}
              onChange={(e) => updateForm({ imap_folder: e.target.value })}
              placeholder="INBOX"
            />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Credentials
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Username / Email</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
              value={form.imap_user}
              onChange={(e) => updateForm({ imap_user: e.target.value })}
              placeholder="import-reports@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Password</label>
            <div className="space-y-1.5">
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                value={form.imap_pass}
                onChange={(e) => {
                  updateForm({ imap_pass: e.target.value });
                  setPwChanged(true);
                }}
                placeholder={form.password_set ? "••••••••" : "IMAP Password"}
              />
              {form.password_set && !pwChanged && (
                <span className="text-[10px] text-slate-400 block font-medium">(currently set)</span>
              )}
            </div>
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !isPortValid}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10"
          >
            {saveMutation.isPending ? "Saving…" : "Save Configuration"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !isPortValid}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
          >
            {testing ? "Testing Connection…" : "Test Connection"}
          </button>
        </div>

        {testResult && (
          <section className="mt-4">
            <div
              className={`rounded-r-lg p-4 text-sm max-w-md border-l-4 transition-all duration-200 shadow-sm ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 border-rose-500 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300"
              }`}
            >
              {testResult.success ? (
                <p className="font-semibold">✓ {testResult.message}</p>
              ) : (
                <p className="font-semibold">✗ {testResult.message}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

