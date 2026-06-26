"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { UploadCloud } from "lucide-react";

interface BulkUploadZoneProps {
  isDragging: boolean;
  onFilesDropped: (files: File[]) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

function filterFiles(raw: FileList | File[]): { valid: File[]; rejected: string[] } {
  const valid: File[] = [];
  const rejected: string[] = [];
  Array.from(raw).forEach((f) => {
    if (ALLOWED_TYPES.includes(f.type) || ALLOWED_EXT.test(f.name)) {
      valid.push(f);
    } else {
      rejected.push(f.name);
    }
  });
  return { valid, rejected };
}

export default function BulkUploadZone({ isDragging, onFilesDropped }: BulkUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const { valid } = filterFiles(e.dataTransfer.files);
    if (valid.length > 0) onFilesDropped(valid);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const { valid } = filterFiles(e.target.files);
    if (valid.length > 0) onFilesDropped(valid);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  const count = isDragging ? null : null; // count shown inside overlay via dataTransfer (read-only before drop)

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
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors"
      >
        <UploadCloud className="w-4 h-4" />
        Upload receipts
      </button>

      {/* Full-viewport drag overlay — portalled so it sits above everything */}
      {isDragging &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-600/20 dark:bg-blue-500/20 backdrop-blur-sm border-4 border-dashed border-blue-500 dark:border-blue-400 pointer-events-auto"
          >
            <UploadCloud className="w-16 h-16 text-blue-500 dark:text-blue-400 mb-4 drop-shadow-lg animate-bounce" />
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 drop-shadow">
              Drop receipts to create expenses
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              JPG · PNG · WEBP · PDF — up to 10 MB each, max 20 files
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
