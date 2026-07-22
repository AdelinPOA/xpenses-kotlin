"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { API_BASE_URL } from "@/lib/api";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

const SignaturePad = dynamic(() => import("@/components/signature/SignaturePad"), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-card h-48 rounded-xl" />,
});

export default function SignaturePage() {
  const queryClient = useQueryClient();
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
      showMessage("Signature saved!");
    },
    onError: () => {
      showMessage("Failed to save signature.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete("/users/me/signature"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signature"] });
      setCacheBuster(Date.now());
      showMessage("Signature deleted.");
    },
    onError: () => {
      showMessage("Failed to delete signature.");
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
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            My Signature
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
              Current Signature
            </p>
            <div className="border border-border rounded-lg p-4 bg-slate-50 dark:bg-slate-800 inline-block mb-4">
              <img
                src={`${API_BASE_URL}/users/me/signature?${cacheBuster}`}
                alt="Your signature"
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
                {deleteMutation.isPending ? "Deleting..." : "Delete Signature"}
              </button>
            </div>
          </div>
        )}

        {/* Draw new signature */}
        <div className="bg-card rounded-xl shadow-sm p-6">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            {hasSignature ? "Draw a New Signature" : "Draw Your Signature"}
          </p>
          <SignaturePad
            onSave={(dataUrl) => saveMutation.mutate(dataUrl)}
          />
          {saveMutation.isPending && (
            <p className="mt-3 text-sm text-muted">
              Saving...
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
