import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { serverFetch } from "@/lib/serverApi";
import { User } from "@/lib/api";
import UsersClient from "./UsersClient";

const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const queryClient = new QueryClient();

  try {
    const users = await serverFetch<User[]>("/users");
    queryClient.setQueryData(userKeys.list(), users);
  } catch (error) {
    console.error("Admin users prefetch failed:", error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UsersClient />
    </HydrationBoundary>
  );
}
