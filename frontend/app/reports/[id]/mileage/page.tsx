"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report } from "@/lib/api";
import { reportKeys, mileageKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import { useTranslations } from "next-intl";

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MileagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reportId = parseInt(id);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const t = useTranslations("reports");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) });
    qc.invalidateQueries({ queryKey: mileageKeys.all });
  };

  const addMileage = useMutation({
    mutationFn: (data: { origin: string; destination: string; distance_km: number; start_time: string; end_time: string; description?: string }) =>
      api.post(`/reports/${id}/mileage`, data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setOrigin("");
      setDestination("");
      setDistanceKm("");
      setStartTime("");
      setEndTime("");
      setDescription("");
    },
  });

  const deleteMileage = useMutation({
    mutationFn: (mileageId: number) => api.delete(`/reports/${id}/mileage/${mileageId}`),
    onSuccess: invalidate,
  });

  const handleAdd = () => {
    const km = parseFloat(distanceKm);
    if (isNaN(km) || km <= 0 || !origin || !destination || !startTime || !endTime) return;
    if (new Date(endTime) <= new Date(startTime)) return;
    addMileage.mutate({
      origin,
      destination,
      distance_km: km,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      ...(description ? { description } : {}),
    });
  };

  if (isLoading) return <AppShell><p className="text-muted-foreground text-sm mt-8">{t("mileage_loading")}</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">{t("mileage_not_found")}</p></AppShell>;

  const records = report.mileage_records || [];
  const totalKm = records.reduce((s, m) => s + m.distance_km, 0);
  const totalNet = records.reduce((s, m) => s + m.amount_eur, 0);
  const totalGross = records.reduce((s, m) => s + m.amount_before_tax, 0);
  const totalDuration = records.reduce((s, m) => s + m.duration_minutes, 0);

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("mileage_back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t("mileage_heading")}</h1>
          <Badge status={report.status} />
        </div>
        <p className="text-sm text-muted mt-1">{report.title}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-teal-500 uppercase mb-1">{t("mileage_total_distance")}</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalKm.toFixed(1)} km</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-blue-500 uppercase mb-1">{t("mileage_driving_time")}</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatDuration(totalDuration)}</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase mb-1">{t("mileage_gross")}</p>
          <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{formatAmount(totalGross, "EUR")}</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-500 uppercase mb-1">{t("mileage_net")}</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalNet, "EUR")}</p>
        </div>
      </div>

      {/* Add button */}
      {report.status === "draft" && (
        <div className="mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              showForm
                ? "bg-teal-600 text-white"
                : "border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30"
            }`}
          >
            <Plus className="w-4 h-4" /> {t("mileage_add_trip")}
          </button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{t("mileage_record_trip")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder={t("mileage_origin")}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
            />
            <input
              type="text"
              placeholder={t("mileage_destination")}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-muted mb-1">{t("mileage_start_time")}</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">{t("mileage_end_time")}</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder={t("mileage_distance")}
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground w-36"
            />
            <input
              type="text"
              placeholder={t("mileage_desc_optional")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground flex-1"
            />
            <button
              onClick={handleAdd}
              disabled={addMileage.isPending || !origin || !destination || !distanceKm || !startTime || !endTime}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {addMileage.isPending ? t("mileage_adding") : t("mileage_add_trip")}
            </button>
          </div>
        </div>
      )}

      {/* Mileage table */}
      <div className="bg-card rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("mileage_trips")} ({records.length})
          </h2>
        </div>
        {records.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">{t("mileage_no_records")}</p>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {records.map((m) => (
                <div key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{m.origin} → {m.destination}</p>
                      <p className="text-xs text-muted mt-0.5">{formatDateTime(m.start_time)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-foreground">{formatAmount(m.amount_eur, "EUR")}</p>
                      <p className="text-xs text-muted-foreground">{m.distance_km.toFixed(1)} km</p>
                    </div>
                  </div>
                  {m.description && (
                    <p className="text-sm text-muted mt-2">{m.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{formatDuration(m.duration_minutes)}</span>
                      <span>Gross: {formatAmount(m.amount_before_tax, "EUR")}</span>
                    </div>
                    {report.status === "draft" && (
                      <button onClick={() => deleteMileage.mutate(m.id)} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="p-4 bg-slate-50 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-700 dark:text-slate-300">{t("mileage_total")}</p>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalNet, "EUR")}</p>
                    <p className="text-xs text-muted">{totalKm.toFixed(1)} km</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted mt-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{formatDuration(totalDuration)}</span>
                  <span>Gross: {formatAmount(totalGross, "EUR")}</span>
                </div>
              </div>
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-muted uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">{t("mileage_table_start")}</th>
                    <th className="text-left px-4 py-3">{t("mileage_table_duration")}</th>
                    <th className="text-left px-4 py-3">{t("mileage_table_route")}</th>
                    <th className="text-right px-4 py-3">{t("mileage_table_km")}</th>
                    <th className="text-right px-4 py-3">{t("mileage_table_rate_bt")}</th>
                    <th className="text-right px-4 py-3">{t("mileage_table_gross")}</th>
                    <th className="text-right px-4 py-3">{t("mileage_table_rate_at")}</th>
                    <th className="text-right px-4 py-3">{t("mileage_table_net")}</th>
                    {report.status === "draft" && <th className="text-right px-4 py-3">{t("mileage_table_actions")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDateTime(m.start_time)}</td>
                      <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-medium">{formatDuration(m.duration_minutes)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {m.origin} → {m.destination}
                        {m.description && <span className="block text-xs text-muted-foreground">{m.description}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{m.distance_km.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(m.rate_before_tax, "EUR")}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">{formatAmount(m.amount_before_tax, "EUR")}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(m.rate_after_tax, "EUR")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatAmount(m.amount_eur, "EUR")}</td>
                      {report.status === "draft" && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => deleteMileage.mutate(m.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
                    <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{t("mileage_total")}</td>
                    <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{formatDuration(totalDuration)}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">{totalKm.toFixed(1)}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">{formatAmount(totalGross, "EUR")}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalNet, "EUR")}</td>
                    {report.status === "draft" && <td></td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
