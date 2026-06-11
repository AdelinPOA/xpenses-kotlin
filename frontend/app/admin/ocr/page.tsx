"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api, { OcrConfig, getOcrConfig, updateOcrConfig, testOcrConfig } from "@/lib/api";
import { ocrKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { Cpu, Sparkles, CheckCircle, AlertCircle } from "lucide-react";

type FormState = OcrConfig;

const DEFAULT_FORM: FormState = {
  ocr_enabled: true,
  provider: "easyocr",
  gemini_api_key: "",
};

const ocrConfigSchema = z.object({
  ocr_enabled: z.boolean(),
  provider: z.string(),
  gemini_api_key: z.string(),
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

export default function OcrAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [pwChanged, setPwChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test states
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<FormState>({
    resolver: zodResolver(ocrConfigSchema) as any,
    defaultValues: DEFAULT_FORM,
  });

  const ocrEnabled = watch("ocr_enabled");
  const provider = watch("provider");
  const passwordSet = watch("gemini_api_key") === "••••••••";

  useEffect(() => {
    if (user && user.role !== "mod") router.replace("/dashboard");
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ocrKeys.config(),
    queryFn: getOcrConfig,
    enabled: user?.role === "mod",
  });

  useEffect(() => {
    if (data) {
      reset({
        ocr_enabled: data.ocr_enabled,
        provider: data.provider,
        gemini_api_key: data.gemini_api_key ? "••••••••" : "",
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
    };
    if (formData.provider === "gemini") {
      payload.gemini_api_key = pwChanged ? formData.gemini_api_key : "••••••••";
    } else {
      payload.gemini_api_key = "";
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
      if (res.success) {
        toast.success("Gemini API connection verified!");
      } else {
        toast.error(`Gemini connection test failed: ${res.message}`);
      }
    } catch (err) {
      setTestResult({ success: false, message: "Test request failed" });
      toast.error("Gemini connection test failed: Request error");
    } finally {
      setTesting(false);
    }
  }

  if (!user || user.role !== "mod") return null;

  return (
    <AppShell>
      {isLoading ? (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-6"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl mx-auto px-4 py-8 space-y-6">
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
                    <option value="gemini">Google Gemini 2.5 Flash (Cloud API)</option>
                    <option value="ollama" disabled>Ollama Local Vision LLM (Coming Soon)</option>
                    <option value="hybrid" disabled>Hybrid OCR + Text LLM (Coming Soon)</option>
                  </select>
                </div>
              </div>
            )}
          </section>

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
      )}
    </AppShell>
  );
}
