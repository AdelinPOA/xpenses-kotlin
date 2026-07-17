"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api, { InsuranceFile, User, downloadBlob } from "@/lib/api";
import { insuranceKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { Plus, Download, Trash2, Shield, FileText, Upload } from "lucide-react";
import SegmentedControl from "@/components/ui/SegmentedControl";

export default function InsurancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDeleteId, setShowDeleteId] = useState<number | null>(null);

  const isManager = user?.role === "manager" || user?.role === "chef_finance" || user?.role === "mod";

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formUserId, setFormUserId] = useState("");

  const { data: files, isLoading } = useQuery<InsuranceFile[]>({
    queryKey: insuranceKeys.list({ all: showAll }),
    queryFn: () =>
      api.get("/insurance", { params: { all: showAll } }).then((r) => r.data),
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["insurance-users"],
    queryFn: () => api.get("/users").then((r) => r.data),
    enabled: isManager && showUpload,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!formFile) throw new Error("No file selected");
      const fd = new FormData();
      fd.append("file", formFile);
      fd.append("title", formTitle);
      fd.append("user_id", formUserId);
      if (formDescription) fd.append("description", formDescription);
      return api.post("/insurance", fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: insuranceKeys.all });
      toast.success("File uploaded");
      resetForm();
    },
    onError: () => toast.error("Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/insurance/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: insuranceKeys.all });
      toast.success("File deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  function resetForm() {
    setShowUpload(false);
    setFormTitle("");
    setFormDescription("");
    setFormFile(null);
    setFormUserId("");
  }

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formFile || !formUserId) return;
    uploadMutation.mutate();
  }

  function handleDownload(file: InsuranceFile) {
    downloadBlob(`/insurance/${file.id}/download`, {}, file.file_name || "document");
  }

  function formatSize(bytes: number | null): string {
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-6 h-6" /> Insurance
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {files?.length ?? 0} file{files?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <>
              <SegmentedControl
                options={[
                  { label: "My Files", value: false },
                  { label: "Company Files", value: true },
                ]}
                value={showAll}
                onChange={setShowAll}
              />
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
              >
                <Upload className="w-4 h-4" />
                Upload File
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={resetForm} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-500" /> Upload Insurance File
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleUpload} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assign to *</label>
                  <select
                    required
                    value={formUserId}
                    onChange={(e) => setFormUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                  >
                    <option value="">Select technician...</option>
                    {(users ?? []).filter((u) => u.role === "technician").map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                  <input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. RCA Insurance 2026"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">File *</label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-900/20 dark:file:text-emerald-400"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Upload</button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Files List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : !files || files.length === 0 ? (
        <EmptyState
          icon={Shield}
          message="No insurance files"
          actionLabel={isManager ? "Upload a file" : undefined}
          onAction={isManager ? () => setShowUpload(true) : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {files.map((f) => (
            <div key={f.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{f.title}</h4>
                  {f.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{f.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500 mt-1">
                    <span>{f.file_name}</span>
                    <span>{formatSize(f.file_size)}</span>
                    {f.user_display_name && showAll && <span>Assigned: {f.user_display_name}</span>}
                    {f.uploaded_by_name && showAll && <span>Uploaded by: {f.uploaded_by_name}</span>}
                    <span>{new Date(f.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDownload(f)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 text-xs font-medium rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                {isManager && (showDeleteId === f.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { deleteMutation.mutate(f.id); setShowDeleteId(null); }} className="text-xs text-red-600 font-semibold px-2">Confirm</button>
                    <button onClick={() => setShowDeleteId(null)} className="text-xs text-slate-400 px-2">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteId(f.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 font-medium rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
