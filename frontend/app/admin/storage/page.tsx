"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api, {
  StorageConfig,
  getStorageConfig,
  updateStorageConfig,
  testStorageConfig,
  getStorageMigrationStatus,
  StorageMigrationStatus,
} from "@/lib/api";
import { storageKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import {
  Database,
  HardDrive,
  Folder,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Play,
  Save,
} from "lucide-react";

type FormState = StorageConfig;

const DEFAULT_FORM: FormState = {
  provider_type: "local",
  local: { path: "" },
  smb: { host: "", share: "", username: "", password: "", domain: "", folder: "receipts" },
  webdav: { url: "", username: "", password: "", folder: "receipts" },
  sftp: { host: "", port: 22, username: "", password: "", folder: "receipts" },
  s3: { endpoint_url: "", access_key: "", secret_key: "", bucket_name: "", region_name: "" },
};

export default function StorageAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormState | null>(null);

  const { register, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormState>({
    defaultValues: DEFAULT_FORM,
  });

  const providerType = watch("provider_type");

  useEffect(() => {
    if (!loading && (!user || user.role !== "mod")) router.replace("/dashboard");
  }, [user, loading, router]);

  const { data: config, isLoading } = useQuery({
    queryKey: storageKeys.config(),
    queryFn: getStorageConfig,
    enabled: !!user && user.role === "mod",
  });

  const { data: migrationStatus } = useQuery<StorageMigrationStatus>({
    queryKey: storageKeys.migration(),
    queryFn: getStorageMigrationStatus,
    enabled: !!user && user.role === "mod",
    refetchInterval: (query) => {
      const state = query.state.data as StorageMigrationStatus | undefined;
      return state?.status === "running" ? 2000 : false;
    },
  });

  useEffect(() => {
    if (config) {
      reset({
        provider_type: config.provider_type,
        local: config.local || { path: "" },
        smb: config.smb || { host: "", share: "", username: "", password: "", domain: "", folder: "receipts" },
        webdav: config.webdav || { url: "", username: "", password: "", folder: "receipts" },
        sftp: config.sftp || { host: "", port: 22, username: "", password: "", folder: "receipts" },
        s3: config.s3 || { endpoint_url: "", access_key: "", secret_key: "", bucket_name: "", region_name: "" },
      });
    }
  }, [config, reset]);

  const saveMutation = useMutation({
    mutationFn: ({ data, migrate }: { data: FormState; migrate: boolean }) =>
      updateStorageConfig(data, migrate),
    onSuccess: () => {
      toast.success("Storage settings saved successfully");
      setShowMigrateModal(false);
      setPendingFormData(null);
      qc.invalidateQueries({ queryKey: storageKeys.all });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to save storage configuration";
      toast.error(msg);
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

  const handleFormSubmit = (data: FormState) => {
    // If provider changed or config is modified, prompt for migration
    const hasProviderChanged = config && config.provider_type !== data.provider_type;
    if (hasProviderChanged || isDirty) {
      setPendingFormData(data);
      setShowMigrateModal(true);
    } else {
      saveMutation.mutate({ data, migrate: false });
    }
  };

  const handleConfirmMigration = (migrate: boolean) => {
    if (pendingFormData) {
      saveMutation.mutate({ data: pendingFormData, migrate });
    }
  };

  const executeTest = async () => {
    setTesting(true);
    setTestResult(null);
    const formValues = watch();
    try {
      const res = await testStorageConfig(formValues);
      setTestResult(res);
      if (res.success) {
        toast.success("Connection verified successfully!");
      } else {
        toast.error(`Connection test failed: ${res.message}`);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.response?.data?.detail ?? "Request error" });
      toast.error("Connection test failed: Network error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Storage Settings</h1>
            <p className="text-sm text-muted">
              Configure dynamic receipt & report storage backends (Local, SMB, WebDAV, SFTP, S3).
            </p>
          </div>
        </div>

        {/* Live Migration Progress Card */}
        {migrationStatus && migrationStatus.status === "running" && (
          <div className="p-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 space-y-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <h2 className="text-md font-semibold text-blue-800 dark:text-blue-300">File Migration in Progress</h2>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Copying files to the new storage backend...</span>
                <span>
                  {migrationStatus.migrated_files + migrationStatus.failed_files} / {migrationStatus.total_files} ({Math.round(((migrationStatus.migrated_files + migrationStatus.failed_files) / (migrationStatus.total_files || 1)) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${((migrationStatus.migrated_files + migrationStatus.failed_files) / (migrationStatus.total_files || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
            {migrationStatus.errors.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 space-y-1 max-h-32 overflow-y-auto">
                <span className="font-semibold block">Migration Errors:</span>
                {migrationStatus.errors.map((err, idx) => (
                  <div key={idx}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Active Storage Protocol
                </label>
                <select
                  {...register("provider_type")}
                  className="w-full max-w-xs px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
                >
                  <option value="local">Local Directory / Mounted Drive</option>
                  <option value="smb">SMB / CIFS Share</option>
                  <option value="webdav">WebDAV Server (Synology NAS)</option>
                  <option value="sftp">SFTP Server (SSH)</option>
                  <option value="s3">S3 Compatible Bucket (MinIO / AWS)</option>
                </select>
              </div>

              <hr className="border-border" />

              {/* Local Storage form fields */}
              {providerType === "local" && (
                <div className="space-y-4">
                  <h3 className="text-md font-semibold text-foreground">Local Storage Configuration</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                      Target Receipts Directory
                    </label>
                    <input
                      type="text"
                      {...register("local.path")}
                      placeholder="/app/data/receipts"
                      className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
                    />
                    <p className="text-xs text-slate-400 mt-1">Must be an absolute path reachable by the backend server.</p>
                  </div>
                </div>
              )}

              {/* SMB Storage form fields */}
              {providerType === "smb" && (
                <div className="space-y-4">
                  <h3 className="text-md font-semibold text-foreground">SMB Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Server Host / IP</label>
                      <input type="text" {...register("smb.host")} placeholder="192.168.1.100" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Share Name</label>
                      <input type="text" {...register("smb.share")} placeholder="shared_folder" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Username</label>
                      <input type="text" {...register("smb.username")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Password</label>
                      <input type="password" {...register("smb.password")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Domain (Optional)</label>
                      <input type="text" {...register("smb.domain")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Subfolder inside share</label>
                      <input type="text" {...register("smb.folder")} placeholder="receipts" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                  </div>
                </div>
              )}

              {/* WebDAV Storage form fields */}
              {providerType === "webdav" && (
                <div className="space-y-4">
                  <h3 className="text-md font-semibold text-foreground">WebDAV Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">WebDAV URL</label>
                      <input type="text" {...register("webdav.url")} placeholder="https://nas.local:5006/dav" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Username</label>
                      <input type="text" {...register("webdav.username")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Password</label>
                      <input type="password" {...register("webdav.password")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Subfolder inside webdav</label>
                      <input type="text" {...register("webdav.folder")} placeholder="receipts" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                  </div>
                </div>
              )}

              {/* SFTP Storage form fields */}
              {providerType === "sftp" && (
                <div className="space-y-4">
                  <h3 className="text-md font-semibold text-foreground">SFTP Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Host</label>
                      <input type="text" {...register("sftp.host")} placeholder="sftp.company.com" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Port</label>
                      <input type="number" {...register("sftp.port")} placeholder="22" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Username</label>
                      <input type="text" {...register("sftp.username")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Password</label>
                      <input type="password" {...register("sftp.password")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Target Folder Path</label>
                      <input type="text" {...register("sftp.folder")} placeholder="receipts" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                  </div>
                </div>
              )}

              {/* S3 Storage form fields */}
              {providerType === "s3" && (
                <div className="space-y-4">
                  <h3 className="text-md font-semibold text-foreground">S3 / MinIO Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Endpoint URL (Optional for AWS, Required for MinIO)</label>
                      <input type="text" {...register("s3.endpoint_url")} placeholder="https://minio.company.com" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Access Key</label>
                      <input type="text" {...register("s3.access_key")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Secret Key</label>
                      <input type="password" {...register("s3.secret_key")} className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Bucket Name</label>
                      <input type="text" {...register("s3.bucket_name")} placeholder="company-receipts" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Region</label>
                      <input type="text" {...register("s3.region_name")} placeholder="us-east-1" className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground" />
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 items-center">
                <button
                  type="button"
                  onClick={executeTest}
                  disabled={testing}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-card-hover rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-semibold shadow-sm transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Settings
                </button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${testResult.success ? "border-green-200 bg-green-50/50 text-green-700 dark:border-green-800/30 dark:bg-green-950/10 dark:text-green-400" : "border-red-200 bg-red-50/50 text-red-700 dark:border-red-800/30 dark:bg-red-950/10 dark:text-red-400"}`}>
                  {testResult.success ? (
                    <CheckCircle className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">{testResult.success ? "Connection verified!" : "Connection test failed"}</span>
                    {!testResult.success && <p className="text-xs mt-1">{testResult.message}</p>}
                  </div>
                </div>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Migration Prompt Modal */}
      {showMigrateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Migrate Existing Receipts?</h3>
                <p className="text-sm text-muted mt-1">
                  You are changing storage configuration. Would you like to automatically copy all existing files from the old storage to the new location in the background?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowMigrateModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm hover:bg-card-hover transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmMigration(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground rounded-lg text-sm transition-colors cursor-pointer"
              >
                No, Keep Files As-Is
              </button>
              <button
                type="button"
                onClick={() => handleConfirmMigration(true)}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Yes, Migrate Files
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
