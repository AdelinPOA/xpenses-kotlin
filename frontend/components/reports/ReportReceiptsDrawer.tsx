"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { API_BASE_URL } from "@/lib/api";
import type { Report } from "@/lib/types/report";
import type { Expense } from "@/lib/types/expense";
import { reportKeys } from "@/lib/queryKeys";
import { formatEur } from "@/lib/format";
import { X, FileText, User, Tag, Paperclip, Loader2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import ReceiptPreview from "@/components/expenses/ReceiptPreview";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTranslations } from "next-intl";

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "javascript:" || protocol === "data:" || protocol === "file:" || protocol === "vbscript:") return "";
    if (url.startsWith("blob:")) return url;
    return parsed.href;
  } catch {
    return "";
  }
}

interface ReceiptItem {
  key: string;
  name: string;
  url: string;
  isImage: boolean;
  isPdf: boolean;
}

interface Props {
  /** Report whose receipts should be reviewed, or null to keep the drawer closed. */
  reportId: number | null;
  onClose: () => void;
}

/**
 * Slide-over that lets a manager view every receipt of a report side-by-side
 * with its line items without leaving the review desk. Reuses the zoomable
 * ReceiptPreview pane from the expense form.
 */
export default function ReportReceiptsDrawer({ reportId, onClose }: Props) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId!),
    queryFn: () => api.get(`/reports/${reportId}`).then((r) => r.data),
    enabled: !!reportId,
  });

  // expense id -> receipt preview items
  const receiptsByExpense = useMemo(() => {
    const map = new Map<number, ReceiptItem[]>();
    report?.expenses?.forEach((exp: Expense) => {
      const items = (exp.receipts ?? []).map(
        (r): ReceiptItem => ({
          key: `${exp.id}-${r.id}`,
          name: r.original_name || r.file_path.split("/").pop() || "receipt",
          url: `${API_BASE_URL}/expenses/${exp.id}/receipts/${r.id}`,
          isImage: /\.(jpg|jpeg|png|webp)$/i.test(r.file_path || r.original_name || ""),
          isPdf: /\.pdf$/i.test(r.file_path || r.original_name || ""),
        })
      );
      if (items.length > 0) map.set(exp.id, items);
    });
    return map;
  }, [report]);

  const expensesWithReceipts = useMemo(
    () => report?.expenses?.filter((e) => receiptsByExpense.has(e.id)) ?? [],
    [report, receiptsByExpense]
  );

  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);

  // Auto-select the first expense that actually has receipts.
  useEffect(() => {
    setSelectedExpenseId(expensesWithReceipts[0]?.id ?? null);
  }, [report?.id]);

  const selectedExpense =
    expensesWithReceipts.find((e) => e.id === selectedExpenseId) ?? expensesWithReceipts[0] ?? null;

  // Zoom / pan state for the shared ReceiptPreview pane.
  const items = selectedExpense ? receiptsByExpense.get(selectedExpense.id) ?? [] : [];
  const [activeReceiptKey, setActiveReceiptKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [selectedExpense?.id]);

  const activeItem = items.find((it) => it.key === activeReceiptKey) ?? items[0] ?? null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingImage) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handlePointerUp = () => setIsDraggingImage(false);

  useBodyScrollLock(!!reportId);

  useEffect(() => {
    if (!reportId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportId, onClose]);

  if (!reportId) return null;

  const totalReceiptCount = Array.from(receiptsByExpense.values()).reduce((n, list) => n + list.length, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-receipts-title"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl bg-card border-l border-border h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              <Paperclip className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 id="report-receipts-title" className="text-lg font-bold text-foreground truncate">
                {isLoading ? t("loading_report") : report?.title || `${t("report_number")}${reportId}`}
              </h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>
                  {t("submitted_by")}{" "}
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {report?.user_display_name || `#${report?.user_id ?? "?"}`}
                  </span>
                </span>
                {report?.status && <Badge status={report.status} />}
                {!isLoading && (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Paperclip className="w-3 h-3" />
                    {t("receipts_count", { count: totalReceiptCount })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={tc("close")}
            className="min-w-11 min-h-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body: line items | receipt preview */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>{t("fetching_details")}</span>
          </div>
        ) : expensesWithReceipts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted p-8 text-center">
            <Paperclip className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">{t("no_receipts_in_report")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            {/* Line-item list */}
            <div className="lg:w-80 lg:shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border p-3 space-y-2 max-h-[40vh] lg:max-h-none">
              {expensesWithReceipts.map((exp) => {
                const isActive = selectedExpense?.id === exp.id;
                const receiptCount = receiptsByExpense.get(exp.id)?.length ?? 0;
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => {
                      setSelectedExpenseId(exp.id);
                      setActiveReceiptKey(null);
                    }}
                    aria-current={isActive}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground truncate text-sm">
                        {exp.merchant || exp.description || t("expenses_section")}
                      </p>
                      <span className="font-bold text-foreground tabular-nums text-sm shrink-0">
                        {formatEur(exp.amount_eur)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 truncate">
                        <Tag className="w-3 h-3" />
                        {exp.category_name || tc("uncategorized")} · {exp.date}
                      </span>
                      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Paperclip className="w-2.5 h-2.5" /> {receiptCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Zoomable receipt preview */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <ReceiptPreview
                items={items}
                activeItem={activeItem}
                zoom={zoom}
                position={position}
                isDraggingImage={isDraggingImage}
                activeReceiptKey={activeItem?.key ?? null}
                onSelectItem={setActiveReceiptKey}
                onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 4))}
                onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 1))}
                onReset={() => {
                  setZoom(1);
                  setPosition({ x: 0, y: 0 });
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                sanitizeUrl={sanitizeUrl}
              />
            </div>
          </div>
        )}

        {/* Footer context line */}
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-border bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <FileText className="w-3.5 h-3.5" />
          <span>
            {t("itemized_expenses")} ({expensesWithReceipts.length}) ·{" "}
            {formatEur(report?.total_reimbursable ?? report?.total_amount ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
