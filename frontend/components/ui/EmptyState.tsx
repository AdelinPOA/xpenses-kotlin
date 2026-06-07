import { Inbox } from "lucide-react";
import clsx from "clsx";

interface EmptyStateProps {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: any;
}

export default function EmptyState({ 
  message = "No items found", 
  actionLabel, 
  onAction,
  icon: Icon = Inbox
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-center px-4">
      <Icon className="w-12 h-12 mb-3" strokeWidth={1.5} />
      <p className="text-sm mb-4">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-4 py-2 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
