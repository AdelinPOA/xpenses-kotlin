import AppShell from "@/components/layout/AppShell";
import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <AppShell>
      <div role="status" aria-label={t("loading")} className="space-y-4">
        <div className="h-7 w-40 rounded-md bg-border-subtle animate-pulse" />
        <div className="h-28 rounded-xl border border-border bg-card animate-pulse" />
        <div className="h-28 rounded-xl border border-border bg-card animate-pulse" />
        <div className="h-28 rounded-xl border border-border bg-card animate-pulse" />
      </div>
    </AppShell>
  );
}
