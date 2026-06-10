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
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white text-sm ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          IMAP Ingestion Settings (Delegation Emails)
        </h1>

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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Connection
          </h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateForm({ enabled: e.target.checked })}
            />
            <span className="text-slate-700 dark:text-slate-300">
              Enable IMAP polling for delegation emails
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">IMAP Host</label>
              <input
                className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={form.imap_host}
                onChange={(e) => updateForm({ imap_host: e.target.value })}
                placeholder="imap.company.com"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">IMAP Port</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 ${
                  !isPortValid ? "border-red-500 focus:outline-red-500" : "dark:border-slate-600"
                }`}
                value={form.imap_port}
                onChange={(e) => updateForm({ imap_port: e.target.value })}
              />
              {!isPortValid && (
                <span className="text-[10px] text-red-500 block mt-1">
                  Port must be between 1 and 65535
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Folder to poll</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
              value={form.imap_folder}
              onChange={(e) => updateForm({ imap_folder: e.target.value })}
              placeholder="INBOX"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Credentials
          </h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Username / Email</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
              value={form.imap_user}
              onChange={(e) => updateForm({ imap_user: e.target.value })}
              placeholder="import-reports@company.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Password</label>
            <div className="space-y-1">
              <input
                type="password"
                className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={form.imap_pass}
                onChange={(e) => {
                  updateForm({ imap_pass: e.target.value });
                  setPwChanged(true);
                }}
                placeholder={form.password_set ? "••••••••" : "IMAP Password"}
              />
              {form.password_set && !pwChanged && (
                <span className="text-[10px] text-slate-400 block">(currently set)</span>
              )}
            </div>
          </div>
        </section>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !isPortValid}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save Configuration"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !isPortValid}
            className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            {testing ? "Testing Connection…" : "Test Connection"}
          </button>
        </div>

        {testResult && (
          <section className="mt-4">
            <div
              className={`rounded p-3 text-sm max-w-md ${
                testResult.success
                  ? "bg-green-50 border border-green-300 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  : "bg-red-50 border border-red-300 dark:bg-red-900/30 text-red-800 dark:text-red-300"
              }`}
            >
              {testResult.success ? (
                <p className="font-medium">✓ {testResult.message}</p>
              ) : (
                <p className="font-medium">✗ {testResult.message}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
