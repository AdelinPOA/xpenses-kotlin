"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(parseInt(id)),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (report) {
      setTitle(report.title);
      setDescription(report.description ?? "");
      setDateFrom(report.date_from ?? "");
      setDateTo(report.date_to ?? "");
    }
  }, [report]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/reports/${id}`, {
        title,
        description: description || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      router.push(`/reports/${id}`);
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to save"),
  });

  if (isLoading) return <AppShell><p className="text-slate-400 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;
  if (report.status !== "draft") {
    return (
      <AppShell>
        <p className="text-amber-600 text-sm mt-8">Only draft reports can be edited.</p>
        <Link href={`/reports/${id}`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Back to report
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to report
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Edit Report</h1>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        className="bg-white rounded-xl shadow-sm p-6 max-w-lg space-y-5"
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date from *</label>
            <input
              type="date"
              required
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date to *</label>
            <input
              type="date"
              required
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={save.isPending}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/reports/${id}`)}
            className="px-5 py-2 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  );
}
