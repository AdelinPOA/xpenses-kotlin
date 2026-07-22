import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { reportKeys } from "@/lib/queryKeys";
import { Report, isPagedResponse, PagedResponse } from "@/lib/api";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const queryClient = new QueryClient();

  try {
    const raw = await serverFetch<Report[] | PagedResponse<Report>>("/reports");
    const reports = isPagedResponse(raw) ? raw.data : raw;
    queryClient.setQueryData(reportKeys.list({ status: "", all: false }), reports);
  } catch (error) {
    console.error("Reports prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReportsClient />
    </HydrationBoundary>
  );
}
