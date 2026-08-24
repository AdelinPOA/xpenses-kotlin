"use client";

import { Camera, X } from "lucide-react";
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
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label="Choose a receipt to scan"
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}
        className={clsx(
          "border border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[120px]",
          isDragging
            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-input-border hover:bg-card-hover/40"
        )}
      >
        <input
          ref={scanInputRef}
          id="receipt-scan-input"
          aria-label="Choose receipt for OCR scanning"
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.webp"
          onChange={onScan}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          id="receipt-camera-input"
          aria-label="Take a receipt photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onCameraCapture}
          className="hidden"
        />
        {isScanning ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
            <div aria-hidden="true" className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {scanProgress?.phase === "uploading"
                ? t("scan_uploading")
                : t("scan_reading", { seconds: scanProgress?.elapsedSeconds ?? 0 })}
            </p>
            {onCancelScan && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelScan();
                }}
                className="min-h-11 min-w-11 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                {t("scan_cancel")}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Camera aria-hidden="true" className={clsx("w-8 h-8 transition-colors", isDragging ? "text-blue-500" : "text-slate-400")} />
            <p className="hidden lg:block text-sm font-medium text-slate-700 dark:text-slate-300">
              {isDragging ? "Drop your receipt here!" : "Drag & drop receipt here, or click to browse"}
            </p>
            <p className="lg:hidden text-sm font-medium text-slate-700 dark:text-slate-300">
              Tap to photograph or choose a receipt
            </p>
            <p className="text-[10px] text-muted-foreground">
              Supports JPG, PNG, PDF, WEBP up to 10MB
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={isScanning}
        className="lg:hidden min-h-11 flex items-center justify-center gap-2 w-full py-2.5 border border-input-border rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-input hover:bg-card-hover disabled:opacity-50 mt-2"
      >
        <Camera className="w-4 h-4" aria-hidden="true" />
        Take photo
      </button>
    </div>
  );
}
