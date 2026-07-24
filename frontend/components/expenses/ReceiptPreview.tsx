"use client";

import { Camera } from "lucide-react";
import clsx from "clsx";

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

export default function ReceiptPreview({
  items, activeItem, zoom, position, isDraggingImage, activeReceiptKey,
  onSelectItem, onZoomIn, onZoomOut, onReset,
  onPointerDown, onPointerMove, onPointerUp, sanitizeUrl,
}: Props) {
  return (
    <div className="w-full lg:flex-1 lg:sticky lg:top-6 bg-card rounded-xl shadow-sm border border-border-subtle/80 p-6 flex flex-col min-h-[450px] self-stretch">
      <div className="border-b border-border-subtle pb-3 mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Receipt Preview</h2>
        {items.length > 0 && (
          <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
            {items.length} {items.length === 1 ? 'file' : 'files'}
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
                "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                (activeReceiptKey === it.key || (activeReceiptKey === null && idx === 0))
                  ? "bg-primary text-white shadow-sm"
                  : "bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              )}
            >
              File {idx + 1}
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
                <button type="button" onClick={onZoomOut} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center" title="Zoom Out">-</button>
                <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={onZoomIn} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-xs font-bold w-11 h-11 lg:w-7 lg:h-7 flex items-center justify-center" title="Zoom In">+</button>
                <button type="button" onClick={onReset} className="p-1 hover:bg-slate-800 dark:hover:bg-slate-700 rounded text-[10px] px-1.5 font-medium ml-1 h-11 lg:h-7 flex items-center" title="Reset Zoom">Reset</button>
              </div>

              <div
                className={clsx("flex-1 w-full flex items-center justify-center p-4 overflow-hidden min-h-[350px] touch-none", zoom > 1 ? "cursor-grab" : "")}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
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
                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-md backdrop-blur-sm transition-colors duration-150"
              >
                View Fullscreen
              </a>
            </div>
          ) : activeItem.isPdf ? (
            <div className="flex-1 flex flex-col min-h-[350px] gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">PDF preview not loading? You can view or download it directly.</p>
                <a href={sanitizeUrl(activeItem.url)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-md transition-colors cursor-pointer">Open PDF</a>
              </div>
              <iframe src={sanitizeUrl(activeItem.url)} className="hidden lg:block w-full flex-1 rounded-lg border border-border min-h-[350px]" title="PDF Preview" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-400">
              <p className="text-sm">No preview available for this file type.</p>
              <a href={sanitizeUrl(activeItem.url)} className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">Download File</a>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-xl p-8 text-center min-h-[350px]">
          <Camera className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No Receipt Selected</h3>
          <p className="text-xs text-muted max-w-[200px]">Upload or scan a receipt to view its preview here.</p>
        </div>
      )}
    </div>
  );
}
