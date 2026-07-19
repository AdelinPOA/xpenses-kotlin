"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api, { LdapConfig, LdapSyncResult, LdapTestResult } from "@/lib/api";
import { ldapKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

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

const ldapConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string(),
  port: z.string().refine(
    (val) => {
      const p = parseInt(val, 10);
      return !isNaN(p) && p >= 1 && p <= 65535;
    },
    { message: "Port must be between 1 and 65535" }
  ),
  use_tls: z.boolean(),
  bind_dn: z.string(),
  bind_password: z.string(),
  base_dn: z.string(),
  user_filter: z.string().min(1, "User Filter is required"),
  attr_username: z.string().min(1, "Username attribute is required"),
  attr_email: z.string().min(1, "Email attribute is required"),
  attr_display_name: z.string().min(1, "Display name attribute is required"),
  attr_role: z.string().min(1, "Role attribute is required"),
  default_role: z.string(),
}).refine(
  (data) => {
    if (data.enabled) {
      return data.host.trim().length > 0;
    }
    return true;
  },
  {
    message: "LDAP Host is required when authentication is enabled",
    path: ["host"],
  }
).refine(
  (data) => {
    if (data.enabled) {
      return data.bind_dn.trim().length > 0;
    }
    return true;
  },
  {
    message: "Bind DN is required when authentication is enabled",
    path: ["bind_dn"],
  }
).refine(
  (data) => {
    if (data.enabled) {
      return data.base_dn.trim().length > 0;
    }
    return true;
  },
  {
    message: "Base DN is required when authentication is enabled",
    path: ["base_dn"],
  }
);

export default function LdapAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [pwChanged, setPwChanged] = useState(false);
  const [roleEntries, setRoleEntries] = useState<RoleMapEntry[]>([]);
  const [roleEntriesDirty, setRoleEntriesDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<LdapTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncResult, setSyncResult] = useState<LdapSyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isDirty } } = useForm<FormState>({
    resolver: zodResolver(ldapConfigSchema) as any,
    defaultValues: DEFAULT_FORM,
  });

  const enabled = watch("enabled");
  const useTls = watch("use_tls");

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

  const { data } = useQuery({
    queryKey: ldapKeys.config(),
    queryFn: () => api.get<LdapConfig>("/settings/ldap").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      reset({ ...data, port: String(data.port), bind_password: "" });
      setRoleEntries(roleMapToEntries(data.role_map));
      setPwChanged(false);
      setRoleEntriesDirty(false);
    }
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (payload: LdapConfig) => api.patch("/settings/ldap", payload),
    onSuccess: () => {
      toast.success("LDAP configuration saved successfully");
      setSaveError(null);
      setPwChanged(false);
      setRoleEntriesDirty(false);
      setSyncResult(null);
      qc.invalidateQueries({ queryKey: ldapKeys.all });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed";
      setSaveError(msg);
      toast.error(`Failed to save LDAP settings: ${msg}`);
    },
  });

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user || user.role !== "mod") {
    return null;
  }

  const onSubmit = (formData: FormState) => {
    setSaveError(null);
    const payload: LdapConfig = {
      ...formData,
      port: parseInt(formData.port, 10) || 389,
      bind_password: pwChanged ? formData.bind_password : "",
      role_map: entriesToRoleMap(roleEntries),
    };
    saveMutation.mutate(payload);
  };

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const formData = getValues();
      const payload = {
        ...formData,
        port: parseInt(formData.port, 10) || 389,
        role_map: entriesToRoleMap(roleEntries),
        use_stored_password: !pwChanged,
      };
      const res = await api.post<LdapTestResult>("/settings/ldap/test", payload);
      setTestResult(res.data);
      if (res.data.ok) {
        toast.success("LDAP test connection successful!");
      } else {
        toast.error(`LDAP test connection failed: ${res.data.error}`);
      }
    } catch {
      setTestResult({ ok: false, preview: [], error: "Request failed" });
      toast.error("LDAP test connection failed: Request error");
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
      toast.success("LDAP user sync completed successfully!");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Sync failed";
      setSyncError(msg);
      toast.error(`LDAP user sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  }

  const isFormDirty = isDirty || roleEntriesDirty;

  if (!user || user.role !== "mod") return null;

  return (
    <AppShell>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl mx-auto px-4 py-8 space-y-6">
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

        {isFormDirty && (
          <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">
            <div className="flex-1">You have unsaved changes.</div>
          </div>
        )}

        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Connection</h2>
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input-border text-blue-600 focus:ring-primary/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
              {...register("enabled")}
            />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Enable LDAP authentication</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Host</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("host")}
                placeholder="ldap.example.com"
              />
              {errors.host && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.host.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Port</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`w-full max-w-[120px] border rounded-lg px-3 py-2 text-base sm:text-sm bg-input dark:text-slate-100 focus:outline-none transition-all duration-200 ${errors.port ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500" : "border-border focus:ring-2 focus:ring-primary/20 focus:border-blue-500"}`}
                {...register("port")}
              />
              {errors.port && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.port.message}</span>
              )}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input-border text-blue-600 focus:ring-primary/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
              {...register("use_tls")}
            />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Use TLS (LDAPS)</span>
          </label>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Bind Credentials</h2>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">Bind DN</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
              {...register("bind_dn")}
              placeholder="cn=admin,dc=example,dc=com"
            />
            {errors.bind_dn && (
              <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.bind_dn.message}</span>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">Bind Password</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
              {...register("bind_password")}
              onChange={(e) => {
                setValue("bind_password", e.target.value, { shouldDirty: true });
                setPwChanged(true);
              }}
              placeholder="Leave blank to keep stored password"
            />
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Directory</h2>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">Base DN</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
              {...register("base_dn")}
              placeholder="dc=example,dc=com"
            />
            {errors.base_dn && (
              <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.base_dn.message}</span>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">User Filter</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
              {...register("user_filter")}
            />
            {errors.user_filter && (
              <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.user_filter.message}</span>
            )}
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Attribute Mapping</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Username attr</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("attr_username")}
              />
              {errors.attr_username && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.attr_username.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Email attr</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("attr_email")}
              />
              {errors.attr_email && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.attr_email.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Display name attr</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("attr_display_name")}
              />
              {errors.attr_display_name && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.attr_display_name.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Role/group attr</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("attr_role")}
              />
              {errors.attr_role && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.attr_role.message}</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5">Default role for unmapped groups</label>
            <select
              className="border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
              {...register("default_role")}
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Role Map</h2>
          {roleEntries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 min-w-0">
              <input
                className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                placeholder="Directory group value"
                value={entry.dir}
                onChange={(e) => {
                  const n = [...roleEntries];
                  n[i] = { ...n[i], dir: e.target.value };
                  setRoleEntries(n);
                  setRoleEntriesDirty(true);
                }}
              />
              <span className="text-slate-400 font-semibold shrink-0">→</span>
              <select
                className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                value={entry.role}
                onChange={(e) => {
                  const n = [...roleEntries];
                  n[i] = { ...n[i], role: e.target.value };
                  setRoleEntries(n);
                  setRoleEntriesDirty(true);
                }}
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                type="button"
                className="shrink-0 text-rose-500 hover:text-rose-700 text-sm px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all duration-200 font-semibold"
                onClick={() => {
                  setRoleEntries(roleEntries.filter((_, j) => j !== i));
                  setRoleEntriesDirty(true);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-all duration-200"
            onClick={() => {
              setRoleEntries([...roleEntries, { dir: "", role: "technician" }]);
              setRoleEntriesDirty(true);
            }}
          >
            + Add mapping
          </button>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={!enabled || syncing}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        {testResult && (
          <div className={`rounded-r-lg p-4 text-sm border-l-4 transition-all duration-200 shadow-sm ${testResult.ok ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/20" : "bg-rose-50 border-rose-500 dark:bg-rose-950/20"}`}>
            {testResult.ok ? (
              <>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 mb-3">✓ Connection successful</p>
                {testResult.preview.length > 0 && (
                  <>
                    {/* Mobile: stacked cards */}
                    <div className="md:hidden divide-y divide-emerald-100 dark:divide-emerald-900/10">
                      {testResult.preview.map((u, i) => (
                        <div key={i} className="py-2">
                          <p className="text-slate-700 dark:text-slate-300 font-medium">{u.username}</p>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">{u.email}</p>
                          <p className="text-slate-700 dark:text-slate-300 text-[11px] mt-0.5">Role: {u.mapped_role}</p>
                        </div>
                      ))}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-muted font-semibold"><th className="pb-2 pr-3">Username</th><th className="pb-2 pr-3">Email</th><th className="pb-2">Mapped role</th></tr></thead>
                        <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/10">{testResult.preview.map((u, i) => <tr key={i}><td className="py-2 pr-3 text-slate-700 dark:text-slate-300 font-medium">{u.username}</td><td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{u.email}</td><td className="py-2 text-slate-700 dark:text-slate-300">{u.mapped_role}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="font-semibold text-rose-800 dark:text-rose-300">✗ {testResult.error}</p>
            )}
          </div>
        )}

        {syncResult && (
          <div className="bg-slate-50 border-l-4 border-slate-500 rounded-r-lg p-4 text-sm dark:bg-slate-900 dark:border-slate-800 shadow-sm flex flex-col gap-1">
            <span className="font-semibold text-foreground">Sync complete</span>
            <span className="text-slate-600 dark:text-slate-400 text-xs">Created: {syncResult.created}  |  Updated: {syncResult.updated}  |  Deactivated: {syncResult.deactivated}  |  Skipped: {syncResult.skipped}  |  Default role assigned: {syncResult.default_role_assigned}</span>
          </div>
        )}

        {syncError && (
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">{syncError}</div>
        )}
      </form>
    </AppShell>
  );
}
