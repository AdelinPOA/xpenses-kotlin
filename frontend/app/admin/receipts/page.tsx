"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ReceiptsCleanupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orphans, setOrphans] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmClean, setShowConfirmClean] = useState(false);
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/settings/receipts/scan");
      return res.data.orphans as string[];
    },
    onSuccess: (data) => {
      setOrphans(data);
      setScanned(true);
      setErrorMsg(null);
      setSuccessMsg(null);
    },
    onError: () => {
      setErrorMsg("Failed to scan filesystem for orphan receipt files.");
    },
  });

  const cleanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/settings/receipts/clean");
      return res.data.cleaned_count as number;
    },
    onSuccess: (count) => {
      setOrphans([]);
      setSuccessMsg(`Successfully deleted ${count} orphan files from disk.`);
      setErrorMsg(null);
    },
    onError: () => {
      setErrorMsg("Failed to clean up orphan files from storage.");
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

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("receipts_heading")}</h1>
            <p className="text-sm text-muted mt-1">
              {t("receipts_description")}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending || cleanMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              {scanMutation.isPending ? t("scanning") : t("scan_storage")}
            </button>
            {scanned && orphans.length > 0 && (
                <button
                  onClick={() => setShowConfirmClean(true)}
                  disabled={cleanMutation.isPending || scanMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {cleanMutation.isPending ? t("scanning") : t("clean_orphans")}
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-medium flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm font-medium flex items-start gap-2.5">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              {scanned ? t("orphan_files", { count: orphans.length }) : "Unscanned State"}
            </h2>
          </div>

          <div className="p-6">
            {!scanned ? (
              <div className="text-center py-12">
                <Trash2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t("no_scan")}</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  {t("no_scan_description")}
                </p>
              </div>
            ) : orphans.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t("storage_clean")}</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  {t("storage_clean_description")}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                  {orphans.map((filePath, index) => (
                    <div key={index} className="p-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-mono break-all">{filePath}</p>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">File Path (Relative)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphans.map((filePath, index) => (
                        <tr key={index} className="border-b border-border-subtle/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-3.5 text-sm text-slate-700 dark:text-slate-300 font-mono break-all">{filePath}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showConfirmClean && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-card rounded-xl border border-border shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-foreground">{t("clean_orphans")}</h3>
            <p className="text-sm text-muted">
              {t("clean_description", { count: orphans.length })}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmClean(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => {
                  cleanMutation.mutate();
                  setShowConfirmClean(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {tc("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
