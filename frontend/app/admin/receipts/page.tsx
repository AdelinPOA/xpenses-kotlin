"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { AlertCircle, CheckCircle, RefreshCw, Trash2 } from "lucide-react";

export default function ReceiptsCleanupPage() {
  const [orphans, setOrphans] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Receipts Cleanup</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Scan the filesystem storage for uploaded files that are no longer linked to any database records.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending || cleanMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              {scanMutation.isPending ? "Scanning..." : "Scan Storage"}
            </button>
            {scanned && orphans.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete all ${orphans.length} orphan files permanently?`)) {
                    cleanMutation.mutate();
                  }
                }}
                disabled={cleanMutation.isPending || scanMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {cleanMutation.isPending ? "Cleaning..." : "Delete All Orphans"}
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

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {scanned ? `Orphan Files Found (${orphans.length})` : "Unscanned State"}
            </h2>
          </div>

          <div className="p-6">
            {!scanned ? (
              <div className="text-center py-12">
                <Trash2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No scan executed</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Click the &quot;Scan Storage&quot; button above to find files that can be safely deleted.
                </p>
              </div>
            ) : orphans.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Storage is clean!</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  All receipt files in the storage volume are correctly matched with expense records in the database.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">File Path (Relative)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphans.map((filePath, index) => (
                      <tr key={index} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3.5 text-sm text-slate-700 dark:text-slate-300 font-mono break-all">{filePath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
