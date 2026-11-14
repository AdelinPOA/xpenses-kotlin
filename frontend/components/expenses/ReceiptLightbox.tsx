"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import AuthorizedImage from "@/components/expenses/AuthorizedImage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  onDownload?: () => void;
}

export default function ReceiptLightbox({
  isOpen,
  onClose,
  imageUrl,
  title,
  onDownload,
}: Props) {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Reset transform when opened or image changes
  useEffect(() => {
    if (isOpen) {
      resetTransform();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, imageUrl, resetTransform]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(2)));
  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, +(z - 0.5).toFixed(2));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || zoom <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // The browser may already have released capture after pointer cancellation.
      }
    }
  };

  // Touch pinch-to-zoom support
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchDistanceRef.current !== null) {
        const delta = dist - touchDistanceRef.current;
        if (Math.abs(delta) > 5) {
          setZoom((prev) => {
            const next = Math.min(4, Math.max(1, prev + delta * 0.008));
            return +next.toFixed(2);
          });
          touchDistanceRef.current = dist;
        }
      } else {
        touchDistanceRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  const handleDoubleTap = () => {
    if (zoom > 1) {
      resetTransform();
    } else {
      setZoom(2);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || t("receipt_preview")}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md select-none touch-none pt-safe pb-safe pl-safe pr-safe animate-fade-in"
    >
      {/* Top Header Controls */}
      <div className="h-14 px-4 flex items-center justify-between text-white border-b border-white/10 shrink-0 z-10">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <span className="text-sm font-semibold truncate text-white/90">
            {title || t("receipt_preview")}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/75 shrink-0">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            aria-label={t("zoom_out")}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ZoomOut className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            aria-label={t("zoom_in")}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ZoomIn className="w-5 h-5" aria-hidden="true" />
          </button>
          {zoom > 1 && (
            <button
              type="button"
              onClick={resetTransform}
              aria-label={t("reset_zoom")}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={tc("download", { defaultValue: "Download" })}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <Download className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tc("close")}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 ml-1"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        className={clsx(
          "flex-1 relative flex items-center justify-center overflow-hidden p-2 sm:p-6",
          zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleTap}
      >
        <AuthorizedImage
          src={imageUrl}
          alt={title || "Receipt"}
          draggable={false}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom})`,
            transition: isDragging ? "none" : "transform 0.15s ease-out",
            maxHeight: "90vh",
            maxWidth: "92vw",
          }}
          className="object-contain rounded-lg shadow-2xl pointer-events-none select-none"
        />
      </div>

      {/* Floating double-tap / gesture hint on mobile */}
      <div className="py-2 text-center text-[11px] text-white/50 pointer-events-none select-none">
        {zoom > 1 ? "Drag to pan · Pinch or double-tap to reset" : "Pinch or double-tap to zoom"}
      </div>
    </div>
  );
}
