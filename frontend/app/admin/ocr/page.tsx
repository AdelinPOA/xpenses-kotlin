"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api, { OcrConfig, getOcrConfig, updateOcrConfig, testOcrConfig, testMinerUConfig, getOcrComparisons } from "@/lib/api";
import { ocrKeys, categoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { Cpu, Sparkles, CheckCircle, AlertCircle } from "lucide-react";

type FormState = OcrConfig;

const DEFAULT_FORM: FormState = {
  ocr_enabled: true,
  provider: "easyocr",
  gemini_api_key: "",
  mineru_url: "http://mineru:8000",
};

const ocrConfigSchema = z.object({
  ocr_enabled: z.boolean(),
  provider: z.string(),
  gemini_api_key: z.string(),
  mineru_url: z.string().optional().nullable(),
  password_set: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.ocr_enabled && data.provider === "gemini") {
      return data.password_set || data.gemini_api_key.trim().length > 0;
    }
    return true;
  },
  {
    message: "Gemini API key is required when Gemini is the selected provider",
    path: ["gemini_api_key"],
  }
);

const getStatusColor = (ocrVal: any, finalVal: any) => {
  if (ocrVal === null || ocrVal === undefined || ocrVal === "" || ocrVal === "None") {
    return "text-slate-400 bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800";
  }
  
  let match = false;
  if (typeof ocrVal === "string" && typeof finalVal === "string") {
    match = ocrVal.trim().toLowerCase() === finalVal.trim().toLowerCase();
  } else {
    match = ocrVal === finalVal;
  }
  
  return match
    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50"
    : "text-rose-700 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50";
};


export default function OcrAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [pwChanged, setPwChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Gemini test states
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // MinerU test states
  const [mineruTestResult, setMineruTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [mineruTesting, setMineruTesting] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<FormState>({
    resolver: zodResolver(ocrConfigSchema) as any,
    defaultValues: DEFAULT_FORM,
  });

  const ocrEnabled = watch("ocr_enabled");
  const provider = watch("provider");
  const passwordSet = watch("gemini_api_key") === "••••••••";

  const { data, isLoading } = useQuery({
    queryKey: ocrKeys.config(),
    queryFn: getOcrConfig,
    enabled: user?.role === "mod",
  });

  const { data: compData } = useQuery({
    queryKey: ocrKeys.comparison(),
    queryFn: getOcrComparisons,
    enabled: user?.role === "mod",
  });

  const { data: categories } = useQuery({
    queryKey: categoryKeys.list(),
    queryFn: () => api.get("/categories").then((r) => r.data),
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      reset({
        ocr_enabled: data.ocr_enabled,
        provider: data.provider,
        gemini_api_key: data.gemini_api_key ? "••••••••" : "",
        mineru_url: data.mineru_url ?? "http://mineru:8000",
      });
      setPwChanged(false);
    }
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<OcrConfig>) => updateOcrConfig(payload),
    onSuccess: () => {
      toast.success("Configuration saved successfully");
      setSaveError(null);
      setPwChanged(false);
      qc.invalidateQueries({ queryKey: ocrKeys.all });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed";
      setSaveError(msg);
      toast.error(`Failed to save settings: ${msg}`);
    },
  });

  const onSubmit = (formData: FormState) => {
    setSaveError(null);
    const payload: Partial<OcrConfig> = {
      ocr_enabled: formData.ocr_enabled,
      provider: formData.provider,
      // Always send the masked placeholder — backend keeps the stored key intact.
      // This way switching providers never wipes the Gemini key.
      gemini_api_key: formData.provider === "gemini" && pwChanged
        ? formData.gemini_api_key
        : "••••••••",
    };
    if (formData.provider === "mineru") {
      payload.mineru_url = formData.mineru_url || "http://mineru:8000";
    }
    saveMutation.mutate(payload);
  };

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const enteredKey = watch("gemini_api_key");
    const payloadKey = (enteredKey === "••••••••" || enteredKey === "") ? null : enteredKey;
    try {
      const res = await testOcrConfig({ gemini_api_key: payloadKey });
      setTestResult(res);
      if (res.success) toast.success("Gemini API connection verified!");
      else toast.error(`Gemini connection test failed: ${res.message}`);
    } catch {
      setTestResult({ success: false, message: "Test request failed" });
      toast.error("Gemini connection test failed: Request error");
    } finally {
      setTesting(false);
    }
  }

  async function handleMineruTest() {
    setMineruTesting(true);
    setMineruTestResult(null);
    try {
      const res = await testMinerUConfig();
      setMineruTestResult(res);
      if (res.success) toast.success("MinerU API connection verified!");
      else toast.error(`MinerU connection test failed: ${res.message}`);
    } catch {
      setMineruTestResult({ success: false, message: "Test request failed" });
      toast.error("MinerU connection test failed: Request error");
    } finally {
      setMineruTesting(false);
    }
  }

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

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

  return (
    <AppShell>
      {isLoading ? (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-6"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">OCR Scanner Settings</h1>

            {saveError && (
              <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200 animate-fadeIn">
                <div className="flex-1">{saveError}</div>
              </div>
            )}

            {isDirty && (
              <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 rounded-r-lg p-4 text-sm flex items-start gap-2 shadow-sm transition-all duration-200">
                <div className="flex-1">You have unsaved changes.</div>
              </div>
            )}

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Core Configuration</h2>

              <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/20 focus:ring-2 focus:ring-offset-0 transition-all duration-200"
                  {...register("ocr_enabled")}
                />
                <span className="text-slate-700 dark:text-slate-300 font-medium">Enable automatic receipt OCR scanning</span>
              </label>

              {ocrEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">OCR engine / provider</label>
                  <div className="relative">
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                      {...register("provider")}
                    >
                      <option value="easyocr">EasyOCR (Local CPU - Default)</option>
                      <option value="mineru">MinerU 2.5 (Local - High Accuracy)</option>
                      <option value="gemini">Google Gemini 2.5 Flash (Cloud API)</option>
                      <option value="ollama" disabled>Ollama Local Vision LLM (Coming Soon)</option>
                      <option value="hybrid" disabled>Hybrid OCR + Text LLM (Coming Soon)</option>
                    </select>
                  </div>
                </div>
              )}
            </section>

            {ocrEnabled && provider === "mineru" && (
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
                  <Cpu className="w-5 h-5" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">MinerU 2.5 — Local API</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  MinerU must be running as a Docker service. Start it with:{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">
                    docker compose --profile mineru up -d mineru
                  </code>
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">MinerU API base URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-200 font-mono"
                      placeholder="http://mineru:8000"
                      {...register("mineru_url")}
                    />
                    <button
                      type="button"
                      onClick={handleMineruTest}
                      disabled={mineruTesting}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all duration-200 disabled:opacity-50 whitespace-nowrap"
                    >
                      {mineruTesting ? "Testing..." : "Test Connection"}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1.5">
                    Use the Docker service name or IP where mineru-api is running. EasyOCR still runs in parallel for accuracy comparison.
                  </span>
                </div>

                {mineruTestResult && (
                  <div className={`p-4 rounded-lg text-sm flex items-start gap-2 animate-fadeIn border ${
                    mineruTestResult.success
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-300"
                      : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-300"
                  }`}>
                    {mineruTestResult.success ? (
                      <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                    )}
                    <div className="flex-1 font-medium">{mineruTestResult.message}</div>
                  </div>
                )}
              </section>
            )}

            {ocrEnabled && provider === "gemini" && (
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">Gemini API Credentials</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Google AI Studio API key</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none transition-all duration-200 ${errors.gemini_api_key ? "border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500" : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"}`}
                        {...register("gemini_api_key")}
                        placeholder={passwordSet ? "••••••••" : "AI Studio API Key"}
                        onChange={(e) => {
                          setValue("gemini_api_key", e.target.value, { shouldDirty: true });
                          setPwChanged(true);
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 disabled:opacity-50"
                      >
                        {testing ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                    {errors.gemini_api_key && (
                      <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">{errors.gemini_api_key.message as string}</span>
                    )}
                    {passwordSet && !pwChanged && (
                      <span className="text-[10px] text-slate-400 block font-medium mt-1.5">(currently set in settings)</span>
                    )}
                  </div>

                  {testResult && (
                    <div className={`p-4 rounded-lg text-sm flex items-start gap-2 animate-fadeIn border ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-300" : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-300"}`}>
                      {testResult.success ? (
                        <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                      )}
                      <div className="flex-1 font-medium">{testResult.message}</div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={!isDirty || saveMutation.isPending}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>

          {/* OCR Engine Accuracy Comparison Section */}
          {compData && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  OCR Engine Accuracy Comparison
                </h2>
              </div>

              {compData.history.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-500 dark:text-slate-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">No comparison data available</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    No OCR scans recorded yet. Create an expense and upload a receipt to begin tracking accuracy.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* EasyOCR Card */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950/40">
                       <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span>EasyOCR (Local)</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">Accuracy</span>
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Amount extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.easyocr_amount_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Date extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.easyocr_date_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Merchant name:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.easyocr_merchant_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Category classification:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.easyocr_category_accuracy}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Google Gemini Card */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950/40">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span>Google Gemini (Cloud)</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">Accuracy</span>
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Amount extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.gemini_amount_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Date extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.gemini_date_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Merchant name:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.gemini_merchant_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Category classification:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.gemini_category_accuracy}%</span>
                        </div>
                      </div>
                    </div>

                    {/* MinerU Card */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-950/40">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span>MinerU 2.5 (Local)</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Accuracy</span>
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Amount extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.mineru_amount_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Date extraction:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.mineru_date_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Merchant name:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.mineru_merchant_accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Category classification:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{compData.stats.mineru_category_accuracy}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* History list */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Scan History & Comparisons (Last {compData.history.length})
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                            <th className="p-3 border-r border-slate-200 dark:border-slate-800">Receipt / Date</th>
                            <th className="p-3">Field</th>
                            <th className="p-3">EasyOCR (Local)</th>
                            <th className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">Gemini (Cloud)</th>
                            <th className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">MinerU 2.5 (Local)</th>
                            <th className="p-3 bg-blue-50/50 dark:bg-blue-950/20 font-bold text-blue-800 dark:text-blue-300">Final (Ground Truth)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {compData.history.map((row) => {
                            const formatCat = (id: number | null) => {
                              if (!id) return null;
                              const cat = categories?.find((c: any) => c.id === id);
                              return cat ? cat.name : `ID: ${id}`;
                            };

                            // null final_* means this scan hasn't been linked to a saved expense yet
                            const isLinked = row.final_amount !== null || row.final_date !== null || row.final_merchant !== null;

                            const fields = [
                              {
                                name: "Amount",
                                easy: row.easyocr_amount !== null ? `${row.easyocr_amount}` : null,
                                gem: row.gemini_amount !== null ? `${row.gemini_amount}` : null,
                                min: row.mineru_amount !== null ? `${row.mineru_amount}` : null,
                                final: isLinked ? (row.final_amount !== null ? `${row.final_amount}` : "—") : null,
                              },
                              {
                                name: "Merchant",
                                easy: row.easyocr_merchant || null,
                                gem: row.gemini_merchant || null,
                                min: row.mineru_merchant || null,
                                final: isLinked ? (row.final_merchant || "—") : null,
                              },
                              {
                                name: "Date",
                                easy: row.easyocr_date || null,
                                gem: row.gemini_date || null,
                                min: row.mineru_date || null,
                                final: isLinked ? (row.final_date || "—") : null,
                              },
                              {
                                name: "Category",
                                easy: formatCat(row.easyocr_category_id),
                                gem: formatCat(row.gemini_category_id),
                                min: formatCat(row.mineru_category_id),
                                final: isLinked ? (formatCat(row.final_category_id) ?? "—") : null,
                              },
                            ];

                            return fields.map((f, index) => (
                              <tr key={`${row.id}-${f.name}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                {index === 0 && (
                                  <td rowSpan={4} className="p-3 font-medium text-slate-700 dark:text-slate-300 align-top border-r border-slate-200 dark:border-slate-800">
                                    <div className="font-semibold truncate max-w-[150px]" title={row.receipt_filename ?? ""}>
                                      {row.receipt_filename ?? "receipt.jpg"}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1 flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span>{new Date(row.created_at).toLocaleDateString()}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-semibold font-mono uppercase tracking-wider">
                                          {row.provider || "gemini"}
                                        </span>
                                      </div>
                                    </div>
                                    {!isLinked && (
                                      <span className="mt-1.5 inline-block text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold">
                                        Not saved yet
                                      </span>
                                    )}
                                  </td>
                                )}
                                <td className="p-3 font-medium text-slate-500 dark:text-slate-400">{f.name}</td>
                                <td className="p-3">
                                  {f.easy !== null ? (
                                    <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${isLinked ? getStatusColor(f.easy, f.final) : "text-slate-600 bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"}`}>
                                      {f.easy}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {f.gem !== null ? (
                                    <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${isLinked ? getStatusColor(f.gem, f.final) : "text-slate-600 bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"}`}>
                                      {f.gem}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {f.min !== null ? (
                                    <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${isLinked ? getStatusColor(f.min, f.final) : "text-slate-600 bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"}`}>
                                      {f.min}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-3 bg-blue-50/10 dark:bg-blue-950/5 font-semibold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800">
                                  {f.final !== null ? (
                                    f.final
                                  ) : (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">Pending save…</span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
