"use client";

import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({
  onSave,
  width = 400,
  height = 200,
}: SignaturePadProps) {
  const t = useTranslations("profile");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  // Mirror of isEmpty so the resize effect can check it without re-running.
  const isEmptyRef = useRef(true);

  // Size the canvas backing store to its rendered CSS width so it fits
  // narrow screens (e.g. iPhone 375px) and stays crisp on retina displays.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = height;

      // Snapshot existing strokes so a resize/rotation doesn't wipe them.
      let snapshot: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0 && !isEmptyRef.current) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
      }

      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      const isDark = document.documentElement.classList.contains("dark");
      ctx.strokeStyle = isDark ? "#ffffff" : "#1e293b";

      if (snapshot) {
        // drawImage honours the context transform (CSS-pixel space);
        // putImageData would bypass it and distort the restored strokes.
        ctx.drawImage(snapshot, 0, 0, cssWidth, cssHeight);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [height]);

  function getContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const isDark = document.documentElement.classList.contains("dark");
    ctx.strokeStyle = isDark ? "#ffffff" : "#1e293b";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;

    return ctx;
  }

  function startDrawing(x: number, y: number) {
    const ctx = getContext();
    if (!ctx) return;
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(x: number, y: number) {
    if (!isDrawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    isEmptyRef.current = false;
    setIsEmpty(false);
  }

  function stopDrawing() {
    isDrawingRef.current = false;
  }

  function getCoordinates(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ("touches" in e) {
      const touch = e.touches[0];
      if (!touch) return { x: 0, y: 0 };
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // The context transform maps CSS pixels to backing-store pixels, so
    // drawing coordinates must be raw CSS pixels relative to the canvas.
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getCoordinates(e);
    startDrawing(x, y);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getCoordinates(e);
    draw(x, y);
  }

  function handleMouseUp() {
    stopDrawing();
  }

  function handleMouseLeave() {
    stopDrawing();
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoordinates(e);
    startDrawing(x, y);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoordinates(e);
    draw(x, y);
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.cancelable) e.preventDefault();
    stopDrawing();
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // clearRect operates in user space; bypass the dpr transform so the
    // full backing store is wiped even when dpr < 1 (zoomed-out browsers).
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    isEmptyRef.current = true;
    setIsEmpty(true);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="border border-input-border rounded-lg cursor-crosshair bg-input w-full touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="px-4 py-2 rounded-lg border border-input-border text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          {t("signature_pad_clear")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("signature_pad_save")}
        </button>
      </div>
    </div>
  );
}
