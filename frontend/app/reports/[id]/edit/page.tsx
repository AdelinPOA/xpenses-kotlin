"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const inputCls =
  "w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100";

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");

  // Delegation fields
  const [kundenauftrag, setKundenauftrag] = useState("");
  const [auftragsart, setAuftragsart] = useState("");
  const [positionstyp, setPositionstyp] = useState("");
  const [technplatzRaw, setTechnplatzRaw] = useState("");
  const [kundeCode, setKundeCode] = useState("");
  const [kundeName, setKundeName] = useState("");
  const [adresse, setAdresse] = useState("");
  const [vorgang, setVorgang] = useState("");
  const [arbeitsplatz, setArbeitsplatz] = useState("");
  const [techniker, setTechniker] = useState("");

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
      setKundenauftrag(report.kundenauftrag ?? "");
      setAuftragsart(report.auftragsart ?? "");
      setPositionstyp(report.positionstyp ?? "");
      setTechnplatzRaw(report.technplatz_raw ?? "");
      setKundeCode(report.kunde_code ?? "");
      setKundeName(report.kunde_name ?? "");
      setAdresse(report.adresse ?? "");
      setVorgang(report.vorgang ?? "");
      setArbeitsplatz(report.arbeitsplatz ?? "");
      setTechniker(report.techniker ?? "");
    }
  }, [report]);

  const hasDelegation = !!(
    report?.kundenauftrag || report?.auftragsart || report?.positionstyp ||
    report?.technplatz_raw || report?.kunde_code || report?.kunde_name ||
    report?.adresse || report?.vorgang || report?.arbeitsplatz || report?.techniker
  );

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/reports/${id}`, {
        title,
        description: description || null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        ...(hasDelegation && {
          kundenauftrag: kundenauftrag || null,
          auftragsart: auftragsart || null,
          positionstyp: positionstyp || null,
          technplatz_raw: technplatzRaw || null,
          kunde_code: kundeCode || null,
          kunde_name: kundeName || null,
          adresse: adresse || null,
          vorgang: vorgang || null,
          arbeitsplatz: arbeitsplatz || null,
          techniker: techniker || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all });
      router.push(`/reports/${id}`);
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to save"),
  });

  if (isLoading) return <AppShell><p className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;
  if (report.status !== "draft") {
    return (
      <AppShell>
        <p className="text-amber-600 dark:text-amber-400 text-sm mt-8">Only draft reports can be edited.</p>
        <Link href={`/reports/${id}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-2 inline-block">
          Back to report
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to report
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Edit Report</h1>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 max-w-lg space-y-5"
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date from *</label>
            <input
              type="date"
              required
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date to *</label>
            <input
              type="date"
              required
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {hasDelegation && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Delegation Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kundenauftrag" value={kundenauftrag} onChange={setKundenauftrag} />
              <Field label="Auftragsart" value={auftragsart} onChange={setAuftragsart} />
            </div>
            <Field label="Positionstyp" value={positionstyp} onChange={setPositionstyp} />
            <Field label="Techn. Platz" value={technplatzRaw} onChange={setTechnplatzRaw} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kunden-Nr." value={kundeCode} onChange={setKundeCode} />
              <Field label="Kundenname" value={kundeName} onChange={setKundeName} />
            </div>
            <Field label="Adresse" value={adresse} onChange={setAdresse} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vorgang" value={vorgang} onChange={setVorgang} />
              <Field label="Techniker" value={techniker} onChange={setTechniker} />
            </div>
            <Field label="Arbeitsplatz" value={arbeitsplatz} onChange={setArbeitsplatz} />
          </div>
        )}

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
            className="px-5 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  );
}
