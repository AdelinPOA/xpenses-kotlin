"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { API_BASE_URL } from "@/lib/api";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AuthorizedImage from "@/components/expenses/AuthorizedImage";

const SignaturePad = dynamic(() => import("@/components/signature/SignaturePad"), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-card h-48 rounded-xl" />,
});

export default function SignaturePage() {
  const queryClient = useQueryClient();
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const [message, setMessage] = useState<string | null>(null);
  const [cacheBuster, setCacheBuster] = useState(() => Date.now());
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signatureQuery = useQuery({
    queryKey: ["signature"],
    queryFn: () => api.get("/users/me/signature"),
    retry: false,
  });

  const hasSignature = signatureQuery.isSuccess;

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  function showMessage(text: string) {
    setMessage(text);
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }

  const saveMutation = useMutation({
    mutationFn: (dataUrl: string) =>
      api.put("/users/me/signature", { image: dataUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signature"] });
      setCacheBuster(Date.now());
      showMessage(t("signature_saved"));
    },
    onError: () => {
      showMessage(t("signature_save_failed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete("/users/me/signature"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signature"] });
      setCacheBuster(Date.now());
      showMessage(t("signature_deleted"));
    },
    onError: () => {
      showMessage(t("signature_delete_failed"));
    },
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {tc("back_to_dashboard")}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            {t("signature_heading")}
          </h1>
        </div>

        {/* Feedback message */}
        {message && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium">
            {message}
          </div>
        )}

        {/* Current signature */}
        {hasSignature && (
          <div className="bg-card rounded-xl shadow-sm p-6 mb-6">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              {t("current_signature")}
            </p>
            <div className="border border-border rounded-lg p-4 bg-slate-50 dark:bg-slate-800 inline-block mb-4">
              <AuthorizedImage
                src={`${API_BASE_URL}/users/me/signature?${cacheBuster}`}
                alt={t("your_signature")}
                className="max-h-40 max-w-full"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? t("deleting") : t("delete_signature")}
              </button>
            </div>
          </div>
        )}

        {/* Draw new signature */}
        <div className="bg-card rounded-xl shadow-sm p-6">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            {hasSignature ? t("draw_new") : t("draw_heading")}
          </p>
          <SignaturePad
            onSave={(dataUrl) => saveMutation.mutate(dataUrl)}
          />
          {saveMutation.isPending && (
            <p className="mt-3 text-sm text-muted">
              {tc("saving")}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
