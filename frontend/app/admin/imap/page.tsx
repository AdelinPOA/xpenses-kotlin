"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api, {
  ImapConfig,
  ImapTestResult,
  simulateEmailIngestion,
  EmailSimulationOut,
  EmailSimulationParsed,
  User,
} from "@/lib/api";
import { imapKeys } from "@/lib/queryKeys";

const MOCK_DELEGATION_EMAIL = `Hello

Here the order for the job in Ukraine.
@Diana Dallanora - NewTech Automation: please organize all for Adelin – thanks!

Folgende Daten zur Einplanung werden bestätigt:

Kundenauftrag            0007038319
Auftragsart              KR20
Positionstyp             Mechanical full installation, start-up
Starttermin              20.04.2026
Endtermin                22.05.2026
Vorgang                  0545           DEJR-N-INB_ER1_Newtech
Arbeitsplatz             ER_MT          1049           Disposition Reinigungst. elektr.  KSE
Techniker                Popescu Adelin Petrisor
TechnPlatz               C374981        Lwiw 40kcph Ukraine Can line 1

Kunde                    0022265695     PJSC CARLSBERG UKRAINE
Adresse                  Kleparivska Str., 18
                         79007          Lviv
                         Ukraine`;
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

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

const imapConfigSchema = z.object({
  enabled: z.boolean(),
  imap_host: z.string(),
  imap_port: z.string().refine(
    (val) => {
      const p = parseInt(val, 10);
      return !isNaN(p) && p >= 1 && p <= 65535;
    },
    { message: "Port must be between 1 and 65535" }
  ),
  imap_user: z.string(),
  imap_pass: z.string(),
  imap_folder: z.string().min(1, "Folder is required"),
  password_set: z.boolean(),
}).refine(
  (data) => {
    if (data.enabled) {
      return data.imap_host.trim().length > 0;
    }
    return true;
  },
  {
    message: "IMAP Host is required when ingestion is enabled",
    path: ["imap_host"],
  }
).refine(
  (data) => {
    if (data.enabled) {
      return data.imap_user.trim().length > 0;
    }
    return true;
  },
  {
    message: "IMAP Username is required when ingestion is enabled",
    path: ["imap_user"],
  }
);

export default function ImapAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [pwChanged, setPwChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test connection states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ImapTestResult | null>(null);

  // Simulation states
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<EmailSimulationOut | null>(null);
  const [selectedSenderEmail, setSelectedSenderEmail] = useState<string>("");
  const [customSenderEmail, setCustomSenderEmail] = useState<string>("");
  const [simulationBody, setSimulationBody] = useState<string>(MOCK_DELEGATION_EMAIL);
  const [selectedParser, setSelectedParser] = useState<"local" | "gemini">("local");

  // Fetch users for dropdown list
  const { data: usersData } = useQuery<User[]>({
    queryKey: ["users-list-sim"],
    queryFn: () => api.get<User[]>("/users").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isDirty } } = useForm<FormState>({
    resolver: zodResolver(imapConfigSchema) as any,
    defaultValues: DEFAULT_FORM,
  });

  const enabled = watch("enabled");
  const passwordSet = watch("password_set");
  const imapPass = watch("imap_pass");

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

  const { data } = useQuery({
    queryKey: imapKeys.config(),
    queryFn: () => api.get<ImapConfig>("/settings/imap").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      reset({ ...data, imap_port: String(data.imap_port), imap_pass: "" });
      setPwChanged(false);
    }
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (payload: ImapConfig) => api.patch("/settings/imap", payload),
    onSuccess: () => {
      toast.success("IMAP configuration saved successfully");
      setSaveError(null);
      setPwChanged(false);
      qc.invalidateQueries({ queryKey: imapKeys.all });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed";
      setSaveError(msg);
      toast.error(`Failed to save IMAP settings: ${msg}`);
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
    const payload: ImapConfig = {
      ...formData,
      imap_port: parseInt(formData.imap_port, 10),
      imap_pass: pwChanged ? formData.imap_pass : "",
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
        imap_port: parseInt(formData.imap_port, 10),
        imap_pass: pwChanged ? formData.imap_pass : "",
      };
      const res = await api.post<ImapTestResult>("/settings/imap/test", payload);
      setTestResult(res.data);
      if (res.data.success) {
        toast.success("IMAP connection test successful!");
      } else {
        toast.error(`IMAP connection test failed: ${res.data.message}`);
      }
    } catch {
      setTestResult({ success: false, message: "Test connection request failed." });
      toast.error("IMAP connection test failed: Request error");
    } finally {
      setTesting(false);
    }
  }

  async function handleSimulate() {
    const sender = selectedSenderEmail === "custom" ? customSenderEmail : selectedSenderEmail;
    if (!sender || sender.trim() === "") {
      toast.error("Please select or input a sender email address.");
      return;
    }
    if (!simulationBody || simulationBody.trim() === "") {
      toast.error("Please input the email body text.");
      return;
    }
    setSimulating(true);
    setSimulationResult(null);
    try {
      const res = await simulateEmailIngestion({
        from_address: sender,
        body_text: simulationBody,
        parser: selectedParser,
      });
      setSimulationResult(res);
      if (res.success) {
        toast.success("Simulation successful! Draft report created.");
      } else {
        toast.error(`Simulation failed: ${res.error}`);
      }
    } catch (err) {
      console.error("IMAP simulation error:", err);
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosErr?.response?.data?.detail || "Simulation failed to run.");
    } finally {
      setSimulating(false);
    }
  }

  if (!user || user.role !== "mod") return null;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            IMAP Ingestion Settings (Delegation Emails)
          </h1>

          {data && (
            <div className="bg-indigo-50/50 border border-indigo-100 dark:bg-indigo-950/10 dark:border-indigo-900/30 rounded-xl p-4 text-xs text-indigo-800 dark:text-indigo-300 flex items-center justify-between gap-3 animate-in fade-in duration-300 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-base">ℹ️</span>
                <p>
                  Email ingestion is currently using the{" "}
                  <strong className="font-bold">
                    {data.active_parser === "gemini" ? "Gemini Parser (Cloud)" : "Local Parser (Offline)"}
                  </strong>{" "}
                  to parse report timeframes and details.
                </p>
              </div>
              <Link
                href="/admin/ocr"
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold whitespace-nowrap"
              >
                Configure at OCR Settings →
              </Link>
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

          <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Connection
            </h2>

            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input-border text-blue-600 focus:ring-primary/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
                {...register("enabled")}
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Enable IMAP polling for delegation emails
              </span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">IMAP Host</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                  {...register("imap_host")}
                  placeholder="imap.company.com"
                />
                {errors.imap_host && (
                  <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_host.message}</span>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5">IMAP Port</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`w-full max-w-[120px] border rounded-lg px-3 py-2 text-base sm:text-sm bg-input dark:text-slate-100 focus:outline-none transition-all duration-200 ${
                    errors.imap_port
                      ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      : "border-border focus:ring-2 focus:ring-primary/20 focus:border-blue-500"
                  }`}
                  {...register("imap_port")}
                />
                {errors.imap_port && (
                  <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_port.message}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Folder to poll</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("imap_folder")}
                placeholder="INBOX"
              />
              {errors.imap_folder && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_folder.message}</span>
              )}
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Credentials
            </h2>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Username / Email</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                {...register("imap_user")}
                placeholder="import-reports@company.com"
              />
              {errors.imap_user && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_user.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Password</label>
              <div className="space-y-1.5">
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-blue-500 transition-all duration-200"
                  {...register("imap_pass")}
                  onChange={(e) => {
                    setValue("imap_pass", e.target.value, { shouldDirty: true });
                    setPwChanged(true);
                  }}
                  placeholder={passwordSet ? "••••••••" : "IMAP Password"}
                />
                {passwordSet && !pwChanged && (
                  <span className="text-[10px] text-slate-400 block font-medium">(currently set)</span>
                )}
              </div>
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10 cursor-pointer"
            >
              {saveMutation.isPending ? "Saving…" : "Save Configuration"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
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
        </form>

        <hr className="border-border" />

        {/* Email Forward Simulator (Local Testing) */}
        <section className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                ✉
              </span>
              Email Forward Ingestion Simulator
            </h2>
            <p className="text-xs text-muted mt-1">
              Simulate forwarding a standardized job delegation email from a company mailbox. This tool parses the text and automatically inserts a draft report for the matched active user in the database.
            </p>
          </div>

          <div className="space-y-4">
            {/* Sender selection */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">
                Simulated Sender (User Email)
              </label>
              <select
                value={selectedSenderEmail}
                onChange={(e) => {
                  setSelectedSenderEmail(e.target.value);
                  if (e.target.value !== "custom" && e.target.value !== "") {
                    setCustomSenderEmail("");
                  }
                }}
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 cursor-pointer"
              >
                <option value="">Select an active user...</option>
                {usersData?.filter(u => u.is_active && u.email).map((u) => (
                  <option key={u.id} value={u.email || ""}>
                    {u.display_name} ({u.email}) [{u.role}]
                  </option>
                ))}
                <option value="custom">Custom email address...</option>
              </select>

              {selectedSenderEmail === "custom" && (
                <div className="mt-3 animate-in fade-in duration-200">
                  <label className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    Custom Email Address
                  </label>
                  <input
                    type="email"
                    value={customSenderEmail}
                    onChange={(e) => setCustomSenderEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200"
                    placeholder="technician@nt-automation.eu"
                  />
                </div>
              )}
            </div>

            {/* Parser selection */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">
                Target Parser (Used to generate report)
              </label>
              <select
                value={selectedParser}
                onChange={(e) => setSelectedParser(e.target.value as "local" | "gemini")}
                className="w-full border rounded-lg px-3 py-2 text-base sm:text-sm bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 cursor-pointer"
              >
                <option value="local">Local Parser (Keyword Extraction)</option>
                <option value="gemini">Gemini Parser (Cloud LLM Extraction)</option>
              </select>
            </div>

            {/* Email Body text */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5 flex justify-between">
                <span>Standardized Email Body (Job Delegation Format)</span>
                <button
                  type="button"
                  onClick={() => setSimulationBody(MOCK_DELEGATION_EMAIL)}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline focus:outline-none cursor-pointer"
                >
                  Reset Template
                </button>
              </label>
              <textarea
                value={simulationBody}
                onChange={(e) => setSimulationBody(e.target.value)}
                rows={12}
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-input border-border dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200"
                placeholder="Paste German job delegation email body here..."
              />
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSimulate}
                disabled={simulating}
                className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-md shadow-indigo-500/10 cursor-pointer flex items-center justify-center gap-2"
              >
                {simulating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Simulating...
                  </>
                ) : (
                  <>Simulate Email Forward</>
                )}
              </button>
            </div>
          </div>

          {/* Simulation Output Result */}
          {simulationResult && (
            <div className="mt-6 border-t border-border-subtle pt-6 animate-in fade-in duration-300 space-y-6">
              {simulationResult.success ? (
                <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 rounded-r-lg p-4 text-sm flex items-start gap-3 shadow-sm">
                  <span className="text-xl font-bold">✓</span>
                  <div>
                    <h4 className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Draft Report Successfully Created
                    </h4>
                    <p className="text-xs mt-0.5">
                      Matched sender: <strong className="font-semibold">{simulationResult.user_display_name}</strong>. Created report using <strong className="font-bold">{simulationResult.active_parser === "gemini" ? "Gemini Parser" : "Local Parser"}</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-3 shadow-sm">
                  <span className="text-xl font-bold">✗</span>
                  <div>
                    <h4 className="font-semibold text-rose-900 dark:text-rose-200">
                      Simulation Failed
                    </h4>
                    <p className="text-xs mt-1 leading-relaxed">
                      {simulationResult.error}
                    </p>
                  </div>
                </div>
              )}

              {/* Side-by-side parsers result */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Local Parser Card */}
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      Local Parser (Offline)
                    </h4>
                    <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      Rule-Based
                    </span>
                  </div>

                  {simulationResult.local_parsed ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="block font-semibold text-muted">Report Title</span>
                        <span className="text-foreground font-medium">{simulationResult.local_parsed.title}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block font-semibold text-muted">Start Date</span>
                          <span className="text-foreground font-medium">{simulationResult.local_parsed.date_from}</span>
                        </div>
                        <div>
                          <span className="block font-semibold text-muted">End Date</span>
                          <span className="text-foreground font-medium">{simulationResult.local_parsed.date_to}</span>
                        </div>
                      </div>
                      <div>
                        <span className="block font-semibold text-muted mb-1">
                          Description
                        </span>
                        <pre className="text-[10px] font-mono bg-card border border-border p-2.5 rounded-lg text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-normal">
                          {simulationResult.local_parsed.description}
                        </pre>
                      </div>
                      <DelegationFields parsed={simulationResult.local_parsed} />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic py-6 text-center">
                      Failed to parse email locally (no date patterns found).
                    </div>
                  )}
                </div>

                {/* 2. Gemini Parser Card */}
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-pulse" />
                      Gemini Parser (Cloud AI)
                    </h4>
                    <span className="text-[10px] bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                      Generative LLM
                    </span>
                  </div>

                  {simulationResult.gemini_parsed ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="block font-semibold text-muted">Report Title</span>
                        <span className="text-foreground font-medium">{simulationResult.gemini_parsed.title}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block font-semibold text-muted">Start Date</span>
                          <span className="text-foreground font-medium">{simulationResult.gemini_parsed.date_from}</span>
                        </div>
                        <div>
                          <span className="block font-semibold text-muted">End Date</span>
                          <span className="text-foreground font-medium">{simulationResult.gemini_parsed.date_to}</span>
                        </div>
                      </div>
                      <div>
                        <span className="block font-semibold text-muted mb-1">
                          Description
                        </span>
                        <pre className="text-[10px] font-mono bg-card border border-border p-2.5 rounded-lg text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-normal">
                          {simulationResult.gemini_parsed.description}
                        </pre>
                      </div>
                      <DelegationFields parsed={simulationResult.gemini_parsed} />
                    </div>
                  ) : (
                    <div className="bg-amber-50/50 border border-amber-200 dark:bg-amber-950/10 dark:border-amber-900/30 rounded-lg p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                      <span className="font-bold block text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-500">Gemini Parsing Inactive / Failed</span>
                      <p className="leading-relaxed">
                        {simulationResult.gemini_error || "No response. Ensure Gemini credentials are valid."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {simulationResult.success && simulationResult.report_id && (
                <div className="flex justify-center pt-2">
                  <Link
                    href={`/reports/${simulationResult.report_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-md shadow-indigo-500/10"
                  >
                    View Created Draft Report ↗
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/** Renders structured delegation fields in a compact table grid */
function DelegationFields({ parsed }: { parsed: EmailSimulationParsed | null | undefined }) {
  if (!parsed) return null;

  const fields: { label: string; value: string | boolean | undefined | null; badge?: boolean }[] = [
    { label: "Kundenauftrag", value: parsed.kundenauftrag },
    { label: "Auftragsart", value: parsed.auftragsart },
    { label: "Positionstyp", value: parsed.positionstyp },
    { label: "TechnPlatz", value: parsed.technplatz_raw, badge: parsed.technplatz_line === true },
    { label: "Kunden-Nr.", value: parsed.kunde_code },
    { label: "Kundenname", value: parsed.kunde_name },
    { label: "Adresse", value: parsed.adresse },
    { label: "Vorgang", value: parsed.vorgang },
    { label: "Arbeitsplatz", value: parsed.arbeitsplatz },
    { label: "Techniker", value: parsed.techniker },
  ];

  const hasAny = fields.some((f) => f.value && String(f.value).length > 0);
  if (!hasAny) return null;

  return (
    <div>
      <span className="block font-semibold text-muted mb-2 text-xs uppercase tracking-wider">
        Delegation Details
      </span>
      <div className="grid grid-cols-1 gap-y-1.5 text-[11px]">
        {fields
          .filter((f) => f.value && String(f.value).length > 0)
          .map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              <span className="text-muted-foreground font-medium shrink-0 w-24">
                {f.label}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-foreground break-words">{String(f.value)}</span>
                {f.badge && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Production Line
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
