"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextProps {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 4 seconds
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutRefs.current.delete(id);
    }, 4000);
    timeoutRefs.current.set(id, timeoutId);
  }, []);

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutRefs.current.clear();
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
  }, []);

  const success = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const error = useCallback((msg: string) => addToast(msg, "error"), [addToast]);
  const info = useCallback((msg: string) => addToast(msg, "info"), [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      {/* Toast container overlay */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg transition-all duration-300 animate-slide-in ${
              t.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-200"
                : t.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-200"
                : "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-900/90 dark:border-slate-800 dark:text-slate-200"
            }`}
          >
            {t.type === "success" && <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />}
            {t.type === "error" && <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />}
            {t.type === "info" && <Info className="w-5 h-5 shrink-0 text-blue-500" />}

            <div className="flex-1 text-sm font-medium leading-5">{t.message}</div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
