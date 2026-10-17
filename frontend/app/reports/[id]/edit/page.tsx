"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api, { Report } from "@/lib/api";
import { reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useFormGuard } from "@/lib/useFormGuard";
import { useTranslations } from "next-intl";

const inputCls =
  "w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:text-slate-100";

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
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
  const t = useTranslations("reports");

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

  const initializedRef = useRef(false);

  useEffect(() => {
    if (report && !initializedRef.current) {
      initializedRef.current = true;
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

  const isDirty = () => {
    if (!report) return false;
    return (
      title !== report.title ||
      description !== (report.description ?? "") ||
      dateFrom !== (report.date_from ?? "") ||
      dateTo !== (report.date_to ?? "") ||
      kundenauftrag !== (report.kundenauftrag ?? "") ||
      auftragsart !== (report.auftragsart ?? "") ||
      positionstyp !== (report.positionstyp ?? "") ||
      technplatzRaw !== (report.technplatz_raw ?? "") ||
      kundeCode !== (report.kunde_code ?? "") ||
      kundeName !== (report.kunde_name ?? "") ||
      adresse !== (report.adresse ?? "") ||
      vorgang !== (report.vorgang ?? "") ||
      arbeitsplatz !== (report.arbeitsplatz ?? "") ||
      techniker !== (report.techniker ?? "")
    );
  };

  const { clearDirty } = useFormGuard(isDirty, t("guard_unsaved_changes") || "You have unsaved changes. Are you sure you want to leave?");

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
      clearDirty();
      qc.invalidateQueries({ queryKey: reportKeys.all });
      router.push(`/reports/${id}`);
    },
    onError: (e: any) => setError(e.response?.data?.detail ?? t("edit_error_save")),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError(t("edit_error_title_required") || "Title is required");
      return;
    }
    if (dateFrom && dateTo && dateTo < dateFrom) {
      setError(t("edit_error_date_order") || "End date cannot be earlier than start date");
      return;
    }
    save.mutate();
  };

  if (isLoading) return <AppShell><p className="text-muted-foreground text-base sm:text-sm mt-8">{t("edit_loading")}</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">{t("edit_not_found")}</p></AppShell>;
  if (report.status !== "draft") {
    return (
      <AppShell>
        <p className="text-amber-600 dark:text-amber-400 text-sm mt-8">{t("edit_only_draft")}</p>
        <Link href={`/reports/${id}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-2 inline-block">
          {t("edit_back")}
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("edit_back")}
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{t("edit_heading")}</h1>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-card rounded-xl shadow-sm p-6 max-w-lg space-y-5"
      >
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="edit-report-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("edit_label_title")}</label>
          <input
            id="edit-report-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-report-date-from" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("edit_label_date_from")}</label>
            <input
              id="edit-report-date-from"
              type="date"
              required
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="edit-report-date-to" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("edit_label_date_to")}</label>
            <input
              id="edit-report-date-to"
              type="date"
              required
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="edit-report-description" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("edit_label_description")}</label>
          <textarea
            id="edit-report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-input-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {hasDelegation && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("edit_section_delegation")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="field-kundenauftrag" label={t("delegation_order_nr")} value={kundenauftrag} onChange={setKundenauftrag} />
              <Field id="field-auftragsart" label={t("delegation_order_type")} value={auftragsart} onChange={setAuftragsart} />
            </div>
            <Field id="field-positionstyp" label={t("delegation_task")} value={positionstyp} onChange={setPositionstyp} />
            <Field id="field-technplatz" label={t("delegation_location")} value={technplatzRaw} onChange={setTechnplatzRaw} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="field-kunde-code" label={t("delegation_customer_nr")} value={kundeCode} onChange={setKundeCode} />
              <Field id="field-kunde-name" label={t("delegation_customer")} value={kundeName} onChange={setKundeName} />
            </div>
            <Field id="field-adresse" label={t("delegation_address")} value={adresse} onChange={setAdresse} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="field-vorgang" label={t("delegation_operation")} value={vorgang} onChange={setVorgang} />
              <Field id="field-techniker" label={t("delegation_technician")} value={techniker} onChange={setTechniker} />
            </div>
            <Field id="field-arbeitsplatz" label={t("delegation_workplace")} value={arbeitsplatz} onChange={setArbeitsplatz} />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={save.isPending}
            className="min-h-11 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
          >
            {save.isPending ? t("edit_saving") : t("edit_save")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isDirty() || window.confirm(t("guard_unsaved_changes") || "You have unsaved changes. Are you sure you want to leave?")) {
                clearDirty();
                router.push(`/reports/${id}`);
              }
            }}
            className="min-h-11 px-5 py-2 border border-input-border text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            {t("edit_cancel")}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
