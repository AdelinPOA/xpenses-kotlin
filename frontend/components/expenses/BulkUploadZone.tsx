"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { UploadCloud } from "lucide-react";

interface BulkUploadZoneProps {
  isDragging: boolean;
  onFilesDropped: (files: File[]) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;
// Servlet max-request-size is 10 MiB including multipart headers/boundaries.
// Keep file bytes within 9 MiB, reserving 1 MiB for browser multipart metadata.
const MAX_BATCH_BYTES = 9 * 1024 * 1024;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export function filterFiles(raw: FileList | File[]): { valid: File[]; rejected: { name: string; reason: "type" | "size" | "count" | "total" }[] } {
  const files = Array.from(raw);
  // Do not silently lose the 21st valid file or start a different batch than selected.
  if (files.length > 20) return { valid: [], rejected: [{ name: "", reason: "count" }] };
  const valid: File[] = [];
  const rejected: { name: string; reason: "type" | "size" | "count" | "total" }[] = [];
  files.forEach(file => {
    if (!ALLOWED_EXT.test(file.name) || (file.type && !ALLOWED_TYPES.includes(file.type))) {
      rejected.push({ name: file.name, reason: "type" });
    } else if (file.size > 10 * 1024 * 1024) {
      rejected.push({ name: file.name, reason: "size" });
    } else {
      valid.push(file);
    }
  });
  const bytes = valid.reduce((sum, file) => sum + file.size, 0);
  // UTF-8 filenames may expand further when quotes/CR/LF are escaped in headers.
  // A generous 1 KiB per part (and closing boundary) covers ordinary browser
  // boundaries/disposition headers; reject extreme metadata rather than using up
  // the reserved headroom. Only files that will actually be submitted count.
  const encoder = new TextEncoder();
  const metadataBytes = valid.reduce((sum, file) => sum + 1024 + 3 * encoder.encode(file.name).length + encoder.encode(file.type).length, 1024);
  if (bytes > MAX_BATCH_BYTES || bytes + metadataBytes > MAX_REQUEST_BYTES) {
    return { valid: [], rejected: [...rejected, { name: "", reason: "total" }] };
  }
  return { valid, rejected };
}

export default function BulkUploadZone({ isDragging, onFilesDropped }: BulkUploadZoneProps) {
  const t = useTranslations("expenses");
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<ReturnType<typeof filterFiles>["rejected"]>([]);

  function acceptFiles(raw: FileList | File[]) {
    const result = filterFiles(raw);
    setRejected(result.rejected);
    if (result.valid.length > 0) onFilesDropped(result.valid);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    acceptFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    acceptFiles(e.target.files);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  return (
    <>
      {/* Hidden file input — triggered by the "Upload receipts" button */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Fallback button rendered inline — always visible */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="min-h-11 inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-card text-slate-700 dark:text-slate-300 hover:bg-card-hover shadow-sm transition-colors"
      >
        <UploadCloud className="w-4 h-4" />
        {t("upload_receipts")}
      </button>

      {rejected.length > 0 && <ul role="alert" className="text-sm text-red-700 dark:text-red-300 space-y-1">
        {rejected.map((file, index) => <li key={index}>{file.reason === "count" ? t("bulk_rejected_count") : file.reason === "total" ? t("bulk_rejected_total") : file.reason === "size" ? t("bulk_rejected_size", { name: file.name }) : t("bulk_rejected_type", { name: file.name })}</li>)}
      </ul>}

      {/* Full-viewport drag overlay — portalled so it sits above everything */}
      {isDragging &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-primary/20 dark:bg-blue-500/20 backdrop-blur-sm border-4 border-dashed border-blue-500 dark:border-blue-400 pointer-events-auto"
          >
            <UploadCloud className="w-16 h-16 text-blue-500 dark:text-blue-400 mb-4 drop-shadow-lg animate-bounce" />
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 drop-shadow">
              {t("drag_heading")}
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              {t("drag_subtext")}
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
