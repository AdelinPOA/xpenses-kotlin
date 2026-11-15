"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import api, { API_BASE_URL } from "@/lib/api";
import AuthorizedImage from "./AuthorizedImage";

interface ReceiptItem {
  key: string;
  name: string;
  url: string;
  isImage: boolean;
  isPdf: boolean;
}

interface Props {
  items: ReceiptItem[];
  activeItem: ReceiptItem | null;
  zoom: number;
  position: { x: number; y: number };
  isDraggingImage: boolean;
  activeReceiptKey: string | null;
  onSelectItem: (key: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  sanitizeUrl: (url: string) => string;
}

function isProtectedApiUrl(url: string): boolean {
  return url.startsWith("/api/") || url.startsWith(`${API_BASE_URL}/`);
}

function toApiRequestPath(url: string): string {
  if (url.startsWith(`${API_BASE_URL}/`)) return url.slice(API_BASE_URL.length);
  if (url.startsWith("/api/")) return url.slice(4);
  return url;
}

export default function ReceiptPreview({
  items, activeItem, zoom, position, isDraggingImage, activeReceiptKey,
  onSelectItem, onZoomIn, onZoomOut, onReset,
  onPointerDown, onPointerMove, onPointerUp, sanitizeUrl,
}: Props) {
  const t = useTranslations("expenses");
  const [pdfBlobState, setPdfBlobState] = useState<{ source: string; blobUrl: string } | null>(null);

  const remotePdfUrl =
    activeItem?.isPdf && isProtectedApiUrl(activeItem.url) ? activeItem.url : null;

  useEffect(() => {
    if (!remotePdfUrl) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    api
      .get<Blob>(toApiRequestPath(remotePdfUrl), { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.data);
        setPdfBlobState({ source: remotePdfUrl, blobUrl: createdUrl });
      })
      .catch(() => {
        if (!cancelled) setPdfBlobState(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [remotePdfUrl]);

  const pdfSrc = remotePdfUrl
    ? pdfBlobState?.source === remotePdfUrl
      ? pdfBlobState.blobUrl
      : ""
    : sanitizeUrl(activeItem?.url ?? "");

  return (
    <div className="w-full lg:flex-1 lg:sticky lg:top-6 bg-card rounded-xl shadow-sm border border-border-subtle/80 p-4 sm:p-6 flex flex-col min-h-[220px] lg:min-h-[450px] self-stretch">
      <div className="border-b border-border-subtle pb-3 mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("receipt_preview")}</h2>
        {items.length > 0 && (
          <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
            {t(items.length === 1 ? "file_count_one" : "file_count_other", { count: items.length })}
          </span>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border-subtle pb-3">
          {items.map((it, idx) => (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelectItem(it.key)}
              className={clsx(
                "min-h-11 px-3 py-2 text-xs font-semibold rounded-md transition-colors",
                (activeReceiptKey === it.key || (activeReceiptKey === null && idx === 0))
                  ? "bg-primary text-white shadow-sm"
                  : "bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              )}
            >
              {t("file_tab", { n: idx + 1 })}
            </button>
          ))}
        </div>
      )}

      {activeItem ? (
        <div className="flex-1 flex flex-col justify-between h-full">
          <div className="mb-3">
            <p className="text-xs font-medium text-foreground truncate">{activeItem.name}</p>
          </div>
          {activeItem.isImage ? (
            <div className="relative group flex-1 flex flex-col items-center bg-background/40 rounded-lg overflow-hidden border border-border-subtle min-h-[400px]">
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 dark:bg-slate-800/90 text-white rounded-lg p-1.5 shadow-lg z-10 select-none">
                <button type="button" onClick={onZoomOut} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center" title={t("zoom_out")}>-</button>
                <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={onZoomIn} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center" title={t("zoom_in")}>+</button>
                <button type="button" onClick={onReset} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-[10px] px-1.5 font-medium ml-1 h-11 lg:h-7 flex items-center" title={t("reset_zoom")}>{t("reset")}</button>
              </div>

              <div
                className={clsx(
                  "flex-1 w-full flex items-center justify-center p-4 overflow-hidden min-h-[350px]",
                  zoom > 1 ? "touch-none cursor-grab" : "touch-pan-y"
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <AuthorizedImage
                  src={activeItem.url}
                  alt={activeItem.name}
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    cursor: zoom > 1 ? (isDraggingImage ? 'grabbing' : 'grab') : 'default'
                  }}
                  className={clsx("max-h-[500px] max-w-full object-contain rounded-md select-none pointer-events-none", !isDraggingImage && "transition-transform duration-200")}
                />
              </div>

              <a
                href={sanitizeUrl(activeItem.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 min-h-11 inline-flex items-center bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-md backdrop-blur-sm transition-colors duration-150"
              >
                {t("view_fullscreen")}
              </a>
            </div>
          ) : activeItem.isPdf ? (
            <div className="flex-1 flex flex-col min-h-[350px] gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">{t("pdf_not_loading")}</p>
                <a
                  href={pdfSrc || sanitizeUrl(activeItem.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
                >
                  {t("open_pdf")}
                </a>
              </div>
              {pdfSrc && (
                <iframe src={pdfSrc} className="hidden lg:block w-full flex-1 rounded-lg border border-border min-h-[350px]" title={t("pdf_iframe")} />
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-400">
              <p className="text-sm">{t("no_preview_available")}</p>
              <a
                href={sanitizeUrl(activeItem.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 min-h-11 inline-flex items-center px-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("download_file")}
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-xl p-6 text-center min-h-[180px] lg:min-h-[350px]">
          <Camera aria-hidden="true" className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t("no_receipt_selected")}</h3>
          <p className="text-xs text-muted max-w-[200px]">{t("no_receipt_subtext")}</p>
        </div>
      )}
    </div>
  );
}

