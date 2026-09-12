"use client";

import { Camera, FileUp, X } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import type { ScanProgress } from "@/lib/ocrScan";

interface Props {
  isScanning: boolean;
  /** Staged OCR progress; null when idle. */
  scanProgress?: ScanProgress | null;
  /** Aborts the in-flight scan (button hidden when absent). */
  onCancelScan?: () => void;
  isDragging: boolean;
  onScan: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCameraCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  scanInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ReceiptScanner({
  isScanning, scanProgress, onCancelScan, isDragging, onScan, onCameraCapture,
  onDragOver, onDragLeave, onDrop, onClick,
  scanInputRef, cameraInputRef,
}: Props) {
  const t = useTranslations("expenses");

  return (
    <div
      className={clsx(
        "receipt-capture rounded-xl border p-3 transition-colors",
        isDragging
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : "border-input-border bg-background/60"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isScanning) onDragOver(event);
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        if (!isScanning) onDrop(event);
      }}
      role="group"
      aria-label={t("receipt_capture_heading")}
      aria-busy={isScanning}
    >
      <input
        ref={scanInputRef}
        id="receipt-scan-input"
        aria-label={t("choose_file")}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,.webp"
        onChange={onScan}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        id="receipt-camera-input"
        aria-label={t("take_photo")}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraCapture}
        className="hidden"
      />

      {isScanning ? (
        <div role="status" aria-live="polite" className="flex min-h-14 items-center gap-3 px-1">
          <div aria-hidden="true" className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="min-w-0 flex-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            {scanProgress?.phase === "uploading"
              ? t("scan_uploading")
              : t("scan_reading", { seconds: scanProgress?.elapsedSeconds ?? 0 })}
          </p>
          {onCancelScan && (
            <button
              type="button"
              onClick={onCancelScan}
              className="min-h-11 shrink-0 inline-flex items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-red-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t("scan_cancel")}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Camera aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("receipt_capture_heading")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isDragging ? t("drop_receipt") : t("receipt_capture_hint")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>{t("take_photo")}</span>
            </button>
            <button
              type="button"
              onClick={onClick}
              disabled={isScanning}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-input-border px-2 text-muted hover:bg-card-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t("choose_file")}
              title={t("choose_file")}
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("choose_file")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
