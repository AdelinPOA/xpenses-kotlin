import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { reportKeys } from "@/lib/queryKeys";
import { Report } from "@/lib/api";
import ReportDetailClient from "./ReportDetailClient";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = parseInt(id);
  const queryClient = new QueryClient();

  try {
    const report = await serverFetch<Report>(`/reports/${id}`);
    queryClient.setQueryData(reportKeys.detail(reportId), report);
  } catch (error) {
    console.error(`Report ${id} prefetch failed:`, error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReportDetailClient params={params} />
    </HydrationBoundary>
  );
}
