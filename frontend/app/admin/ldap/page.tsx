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
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-sm font-medium transition-all duration-300 ${toast.ok ? "bg-emerald-600 shadow-emerald-600/10" : "bg-rose-600 shadow-rose-600/10"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">LDAP / Active Directory</h1>

        {data?.bind_password_invalid && (
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">
            <div className="flex-1">Stored bind password is invalid — please re-enter it.</div>
          </div>
        )}

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
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200" checked={form.enabled} onChange={(e) => updateForm({ enabled: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Enable LDAP authentication</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Host</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.host} onChange={(e) => updateForm({ host: e.target.value })} placeholder="ldap.example.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Port</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full max-w-[120px] border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.port} onChange={(e) => updateForm({ port: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200" checked={form.use_tls} onChange={(e) => updateForm({ use_tls: e.target.checked })} />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Use TLS (LDAPS)</span>
          </label>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bind Credentials</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Bind DN</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.bind_dn} onChange={(e) => updateForm({ bind_dn: e.target.value })} placeholder="cn=admin,dc=example,dc=com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Bind Password</label>
            <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.bind_password} onChange={(e) => { updateForm({ bind_password: e.target.value }); setPwChanged(true); }} placeholder="Leave blank to keep stored password" />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Directory</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Base DN</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.base_dn} onChange={(e) => updateForm({ base_dn: e.target.value })} placeholder="dc=example,dc=com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">User Filter</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.user_filter} onChange={(e) => updateForm({ user_filter: e.target.value })} />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attribute Mapping</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([["attr_username","Username attr"],["attr_email","Email attr"],["attr_display_name","Display name attr"],["attr_role","Role/group attr"]] as [keyof LdapConfig, string][]).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form[field] as string} onChange={(e) => updateForm({ [field]: e.target.value })} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Default role for unmapped groups</label>
            <select className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={form.default_role} onChange={(e) => updateForm({ default_role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Role Map</h2>
          {roleEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3">
              <input className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" placeholder="Directory group value" value={entry.dir} onChange={(e) => { const n = [...roleEntries]; n[i] = { ...n[i], dir: e.target.value }; setRoleEntries(n); setIsDirty(true); }} />
              <span className="text-slate-400 font-semibold">→</span>
              <select className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200" value={entry.role} onChange={(e) => { const n = [...roleEntries]; n[i] = { ...n[i], role: e.target.value }; setRoleEntries(n); setIsDirty(true); }}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" className="text-rose-500 hover:text-rose-700 text-sm px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all duration-200 font-semibold" onClick={() => { setRoleEntries(roleEntries.filter((_, j) => j !== i)); setIsDirty(true); }}>✕</button>
            </div>
          ))}
          <button type="button" className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-all duration-200" onClick={() => { setRoleEntries([...roleEntries, { dir: "", role: "technician" }]); setIsDirty(true); }}>+ Add mapping</button>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10">
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={handleTest} disabled={testing} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200">
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" onClick={handleSync} disabled={!form.enabled || syncing} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200">
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        {testResult && (
          <div className={`rounded-r-lg p-4 text-sm border-l-4 transition-all duration-200 shadow-sm ${testResult.ok ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/20" : "bg-rose-50 border-rose-500 dark:bg-rose-950/20"}`}>
            {testResult.ok ? (
              <>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 mb-3">✓ Connection successful</p>
                {testResult.preview.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-slate-500 dark:text-slate-400 font-semibold"><th className="pb-2 pr-3">Username</th><th className="pb-2 pr-3">Email</th><th className="pb-2">Mapped role</th></tr></thead>
                      <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/10">{testResult.preview.map((u, i) => <tr key={i}><td className="py-2 pr-3 text-slate-700 dark:text-slate-300 font-medium">{u.username}</td><td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{u.email}</td><td className="py-2 text-slate-700 dark:text-slate-300">{u.mapped_role}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="font-semibold text-rose-800 dark:text-rose-300">✗ {testResult.error}</p>
            )}
          </div>
        )}

        {syncResult && (
          <div className="bg-slate-50 border-l-4 border-slate-500 rounded-r-lg p-4 text-sm dark:bg-slate-900 dark:border-slate-800 shadow-sm flex flex-col gap-1">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Sync complete</span>
            <span className="text-slate-600 dark:text-slate-400 text-xs">Created: {syncResult.created}  |  Updated: {syncResult.updated}  |  Deactivated: {syncResult.deactivated}  |  Skipped: {syncResult.skipped}  |  Default role assigned: {syncResult.default_role_assigned}</span>
          </div>
        )}

        {syncError && (
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">{syncError}</div>
        )}
      </div>
    </AppShell>
  );
}
