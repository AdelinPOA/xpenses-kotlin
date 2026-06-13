"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api, {
  ImapConfig,
  ImapTestResult,
  simulateEmailIngestion,
  EmailSimulationOut,
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
  const { user } = useAuth();
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
    if (user && user.role !== "mod") router.replace("/dashboard");
  }, [user, router]);

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
      });
      setSimulationResult(res);
      if (res.success) {
        toast.success("Simulation successful! Draft report created.");
      } else {
        toast.error(`Simulation failed: ${res.error}`);
      }
    } catch (err) {
      toast.error("Simulation failed to run.");
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

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Connection
            </h2>

            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
                {...register("enabled")}
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
                  {...register("imap_host")}
                  placeholder="imap.company.com"
                />
                {errors.imap_host && (
                  <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_host.message}</span>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">IMAP Port</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`w-full max-w-[120px] border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none transition-all duration-200 ${
                    errors.imap_port
                      ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                      : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  }`}
                  {...register("imap_port")}
                />
                {errors.imap_port && (
                  <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_port.message}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Folder to poll</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                {...register("imap_folder")}
                placeholder="INBOX"
              />
              {errors.imap_folder && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_folder.message}</span>
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Credentials
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Username / Email</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                {...register("imap_user")}
                placeholder="import-reports@company.com"
              />
              {errors.imap_user && (
                <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.imap_user.message}</span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Password</label>
              <div className="space-y-1.5">
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-sm shadow-blue-500/10 cursor-pointer"
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

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* Email Forward Simulator (Local Testing) */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                ✉
              </span>
              Email Forward Ingestion Simulator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Simulate forwarding a standardized job delegation email from a company mailbox. This tool parses the text and automatically inserts a draft report for the matched active user in the database.
            </p>
          </div>

          <div className="space-y-4">
            {/* Sender selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
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
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 cursor-pointer"
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
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200"
                    placeholder="technician@nt-automation.eu"
                  />
                </div>
              )}
            </div>

            {/* Email Body text */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex justify-between">
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
                className="w-full border rounded-lg px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200"
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
            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-6 animate-in fade-in duration-300">
              {simulationResult.success ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 rounded-r-lg p-4 text-sm flex items-start gap-3 shadow-sm">
                    <span className="text-xl">✓</span>
                    <div>
                      <h4 className="font-semibold text-emerald-900 dark:text-emerald-200">
                        Draft Report Successfully Created
                      </h4>
                      <p className="text-xs mt-0.5">
                        Matched sender: <strong className="font-semibold">{simulationResult.user_display_name}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Parsed Report Details
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="block font-semibold text-slate-500 dark:text-slate-400">Report Title</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{simulationResult.parsed?.title}</span>
                      </div>
                      <div>
                        <span className="block font-semibold text-slate-500 dark:text-slate-400">Start Date</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{simulationResult.parsed?.date_from}</span>
                      </div>
                      <div>
                        <span className="block font-semibold text-slate-500 dark:text-slate-400">End Date</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{simulationResult.parsed?.date_to}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Report Description
                      </span>
                      <pre className="text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-3 rounded-lg text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {simulationResult.parsed?.description}
                      </pre>
                    </div>
                  </div>

                  <div className="flex justify-start pt-1">
                    <a
                      href={`/reports/${simulationResult.report_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 border border-indigo-600 rounded-lg text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                    >
                      View Created Draft Report ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-3 shadow-sm">
                  <span className="text-xl">✗</span>
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
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
