"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { LdapConfig, LdapSyncResult, LdapTestResult } from "@/lib/api";
import { ldapKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";

const ROLE_OPTIONS = ["technician", "manager", "chef_finance", "mod"];

type FormState = Omit<LdapConfig, "port"> & { port: string };

const DEFAULT_FORM: FormState = {
  enabled: false,
  host: "",
  port: "389",
  use_tls: false,
  bind_dn: "",
  bind_password: "",
  base_dn: "",
  user_filter: "(objectClass=person)",
  attr_username: "uid",
  attr_email: "mail",
  attr_display_name: "cn",
  attr_role: "memberOf",
  role_map: {},
  default_role: "technician",
};

type RoleMapEntry = { dir: string; role: string };

function roleMapToEntries(rm: Record<string, string>): RoleMapEntry[] {
  return Object.entries(rm).map(([dir, role]) => ({ dir, role }));
}
function entriesToRoleMap(entries: RoleMapEntry[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const e of entries) { if (e.dir) m[e.dir] = e.role; }
  return m;
}

export default function LdapAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const [roleEntries, setRoleEntries] = useState<RoleMapEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [testResult, setTestResult] = useState<LdapTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncResult, setSyncResult] = useState<LdapSyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "mod") router.replace("/dashboard");
  }, [user, router]);

  const { data } = useQuery({
    queryKey: ldapKeys.config(),
    queryFn: () => api.get<LdapConfig>("/settings/ldap").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      setForm({ ...data, port: String(data.port), bind_password: "" });
      setRoleEntries(roleMapToEntries(data.role_map));
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
    mutationFn: (payload: LdapConfig) => api.patch("/settings/ldap", payload),
    onSuccess: () => {
      setToast({ msg: "Configuration saved", ok: true });
      setSaveError(null);
      setPwChanged(false);
      setIsDirty(false);
      setSyncResult(null);
      qc.invalidateQueries({ queryKey: ldapKeys.all });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed";
      setSaveError(msg);
    },
  });

  function handleSave() {
    setSaveError(null);
    const payload: LdapConfig = {
      ...form,
      port: parseInt(form.port) || 389,
      bind_password: pwChanged ? form.bind_password : "",
      role_map: entriesToRoleMap(roleEntries),
    };
    saveMutation.mutate(payload);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        ...form,
        port: parseInt(form.port) || 389,
        role_map: entriesToRoleMap(roleEntries),
        use_stored_password: !pwChanged,
      };
      const res = await api.post<LdapTestResult>("/settings/ldap/test", payload);
      setTestResult(res.data);
    } catch {
      setTestResult({ ok: false, preview: [], error: "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await api.post<LdapSyncResult>("/settings/ldap/sync");
      setSyncResult(res.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Sync failed";
      setSyncError(msg);
    } finally {
      setSyncing(false);
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
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">LDAP / Active Directory</h1>

        {data?.bind_password_invalid && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded p-3 text-sm">
            Stored bind password is invalid — please re-enter it.
          </div>
        )}

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
            <input type="checkbox" checked={form.enabled} onChange={(e) => updateForm({ enabled: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300">Enable LDAP authentication</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Host</label>
              <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.host} onChange={(e) => updateForm({ host: e.target.value })} placeholder="ldap.example.com" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Port</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.port} onChange={(e) => updateForm({ port: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.use_tls} onChange={(e) => updateForm({ use_tls: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300">Use TLS (LDAPS)</span>
          </label>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bind Credentials</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bind DN</label>
            <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.bind_dn} onChange={(e) => updateForm({ bind_dn: e.target.value })} placeholder="cn=admin,dc=example,dc=com" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bind Password</label>
            <input type="password" className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.bind_password} onChange={(e) => { updateForm({ bind_password: e.target.value }); setPwChanged(true); }} placeholder="Leave blank to keep stored password" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Directory</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Base DN</label>
            <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.base_dn} onChange={(e) => updateForm({ base_dn: e.target.value })} placeholder="dc=example,dc=com" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">User Filter</label>
            <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.user_filter} onChange={(e) => updateForm({ user_filter: e.target.value })} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attribute Mapping</h2>
          <div className="grid grid-cols-2 gap-4">
            {([["attr_username","Username attr"],["attr_email","Email attr"],["attr_display_name","Display name attr"],["attr_role","Role/group attr"]] as [keyof LdapConfig, string][]).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <input className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form[field] as string} onChange={(e) => updateForm({ [field]: e.target.value })} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Default role for unmapped groups</label>
            <select className="border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={form.default_role} onChange={(e) => updateForm({ default_role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role Map</h2>
          {roleEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" placeholder="Directory group value" value={entry.dir} onChange={(e) => { const n = [...roleEntries]; n[i] = { ...n[i], dir: e.target.value }; setRoleEntries(n); setIsDirty(true); }} />
              <span className="text-slate-400">→</span>
              <select className="border rounded px-2 py-1 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value={entry.role} onChange={(e) => { const n = [...roleEntries]; n[i] = { ...n[i], role: e.target.value }; setRoleEntries(n); setIsDirty(true); }}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" className="text-red-500 hover:text-red-700 text-sm px-1" onClick={() => { setRoleEntries(roleEntries.filter((_, j) => j !== i)); setIsDirty(true); }}>✕</button>
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600 hover:underline dark:text-blue-400" onClick={() => { setRoleEntries([...roleEntries, { dir: "", role: "technician" }]); setIsDirty(true); }}>+ Add mapping</button>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={handleTest} disabled={testing} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-50">
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" onClick={handleSync} disabled={!form.enabled || syncing} className="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        {testResult && (
          <div className={`rounded p-3 text-sm ${testResult.ok ? "bg-green-50 border border-green-300 dark:bg-green-900/30" : "bg-red-50 border border-red-300 dark:bg-red-900/30"}`}>
            {testResult.ok ? (
              <>
                <p className="font-medium text-green-700 dark:text-green-300 mb-2">✓ Connection successful</p>
                {testResult.preview.length > 0 && (
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-500"><th className="pb-1 pr-3">Username</th><th className="pb-1 pr-3">Email</th><th className="pb-1">Mapped role</th></tr></thead>
                    <tbody>{testResult.preview.map((u, i) => <tr key={i}><td className="pr-3 text-slate-700 dark:text-slate-300">{u.username}</td><td className="pr-3 text-slate-600 dark:text-slate-400">{u.email}</td><td className="text-slate-700 dark:text-slate-300">{u.mapped_role}</td></tr>)}</tbody>
                  </table>
                )}
              </>
            ) : (
              <p className="text-red-700 dark:text-red-300">✗ {testResult.error}</p>
            )}
          </div>
        )}

        {syncResult && (
          <div className="bg-slate-50 border rounded p-3 text-sm dark:bg-slate-800 dark:border-slate-600">
            <span className="font-medium text-slate-700 dark:text-slate-200">Sync complete — </span>
            <span className="text-slate-600 dark:text-slate-400">Created: {syncResult.created}  Updated: {syncResult.updated}  Deactivated: {syncResult.deactivated}  Skipped: {syncResult.skipped}  Default role assigned: {syncResult.default_role_assigned}</span>
          </div>
        )}

        {syncError && (
          <div className="bg-red-50 border border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded p-3 text-sm">{syncError}</div>
        )}
      </div>
    </AppShell>
  );
}
