"use client";

import { useRef, useState, useEffect } from "react";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;

    const isDark = document.documentElement.classList.contains("dark");
    ctx.strokeStyle = isDark ? "#ffffff" : "#1e293b";
  }, []);

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

    // Scale coordinates to match internal canvas resolution
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        width={width}
        height={height}
        className="border border-input-border rounded-lg cursor-crosshair bg-input max-w-full h-auto touch-none"
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
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}
