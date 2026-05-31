import api, { User } from "./api";

export async function login(username: string, password: string): Promise<User> {
  const { data } = await api.post("/auth/login", { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function refreshTokens(): Promise<void> {
  await api.post("/auth/refresh");
}

export async function getMe(): Promise<User> {
  const { data } = await api.get("/auth/me");
  return data;
}
