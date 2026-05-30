import { Inbox } from "lucide-react";

export default function EmptyState({ message = "No items found" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Inbox className="w-12 h-12 mb-3" strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
