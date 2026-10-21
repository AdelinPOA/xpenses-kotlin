import { cookies } from "next/headers";

export async function serverFetch<T>(
  endpoint: string,
  params?: Record<string, string | boolean | number>,
  init?: RequestInit
): Promise<T> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  const INTERNAL_API_URL = process.env.INTERNAL_API_URL || "http://backend:8080/api";

  const cookieString = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const headers = new Headers(init?.headers);
  if (cookieString) {
    headers.set("Cookie", cookieString);
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
  }

  const url = `${INTERNAL_API_URL}${endpoint}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  
  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Server fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
