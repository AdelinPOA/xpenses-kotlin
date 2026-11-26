"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextProps {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
  warning: (message: string, action?: ToastAction) => void;
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

  const addToast = useCallback((message: string, type: ToastType, action?: ToastAction) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, action }]);

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

  const success = useCallback((msg: string, action?: ToastAction) => addToast(msg, "success", action), [addToast]);
  const error = useCallback((msg: string, action?: ToastAction) => addToast(msg, "error", action), [addToast]);
  const info = useCallback((msg: string, action?: ToastAction) => addToast(msg, "info", action), [addToast]);
  const warning = useCallback((msg: string, action?: ToastAction) => addToast(msg, "warning", action), [addToast]);
  const toastActions = useMemo(() => ({ success, error, info, warning }), [success, error, info, warning]);

  return (
    <ToastContext.Provider value={toastActions}>
      {children}
      {/* Toast container overlay */}
      <div data-testid="toast-container" className="fixed top-[calc(4.25rem_+_env(safe-area-inset-top,0px))] lg:top-4 left-4 right-4 sm:left-auto sm:right-4 z-[9999] flex flex-col gap-3 sm:w-full sm:max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            aria-live={t.type === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300 animate-slide-in ${
              t.type === "success"
                ? "bg-emerald-50/95 border-emerald-200/90 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-800/80 dark:text-emerald-200"
                : t.type === "warning"
                ? "bg-amber-50/95 border-amber-200/90 text-amber-900 dark:bg-amber-950/90 dark:border-amber-800/80 dark:text-amber-200"
                : t.type === "error"
                ? "bg-rose-50/95 border-rose-200/90 text-rose-900 dark:bg-rose-950/90 dark:border-rose-800/80 dark:text-rose-200"
                : "bg-card/95 border-border text-foreground"
            }`}
          >
            {t.type === "success" && <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />}
            {t.type === "warning" && <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />}
            {t.type === "error" && <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />}
            {t.type === "info" && <Info className="w-5 h-5 shrink-0 text-blue-500" />}

            <div className="flex-1 text-sm font-medium leading-5">
              {t.message}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    removeToast(t.id);
                  }}
                  className="block mt-1 text-xs font-bold underline underline-offset-2 hover:opacity-80"
                >
                  {t.action.label}
                </button>
              )}
            </div>

            <button
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="min-w-11 min-h-11 -mr-2 -mt-2 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 shrink-0 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
