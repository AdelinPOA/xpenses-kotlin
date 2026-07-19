"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex items-center justify-center min-h-screen min-h-dvh px-4 bg-background">
          <div className="bg-card rounded-xl border border-border shadow-sm p-8 max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Application Error
            </h1>
            <p className="text-sm text-muted">
              A critical error occurred. Please try reloading the application.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
