import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

export default function EmptyState({
  message = "No items found",
  actionLabel,
  onAction,
  icon: Icon = Inbox
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-surface-subtle border border-border/80 flex items-center justify-center mb-3.5 text-muted-foreground">
        <Icon aria-hidden="true" className="w-6 h-6" strokeWidth={1.6} />
      </div>
      <p className="text-sm font-medium text-muted mb-4 max-w-xs">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 px-4 py-2 text-xs font-semibold bg-card text-foreground border border-border rounded-xl hover:bg-card-hover transition-colors shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
