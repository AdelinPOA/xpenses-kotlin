import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { User, Report } from "@/lib/api";
import ProfileDetailClient from "./ProfileDetailClient";

export const dynamic = "force-dynamic";

export default async function UserProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const targetUserId = parseInt(id, 10);
  const queryClient = new QueryClient();

  try {
    const [user, reports] = await Promise.all([
      serverFetch<User>(`/users/${targetUserId}`),
      serverFetch<Report[]>("/reports", { all: true, user_id: targetUserId }),
    ]);
    queryClient.setQueryData(["users", targetUserId], user);
    queryClient.setQueryData(["reports", "user", targetUserId], reports);
  } catch (error) {
    console.error(`User profile ${id} prefetch failed:`, error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProfileDetailClient />
    </HydrationBoundary>
  );
}
