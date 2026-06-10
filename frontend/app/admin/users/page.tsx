"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api, { User } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { Shield, ShieldOff, XCircle, Plus } from "lucide-react";

const ROLE_OPTIONS: { value: User["role"]; label: string }[] = [
  { value: "technician", label: "Technician" },
  { value: "manager", label: "Manager" },
  { value: "chef_finance", label: "Chef of Finances" },
  { value: "mod", label: "Moderator" },
];

const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

interface CreateUserForm {
  username: string;
  display_name: string;
  password: string;
  role: User["role"];
  email: string;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: "",
    display_name: "",
    password: "",
    role: "technician",
    email: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const isPrivileged = currentUser?.role === "mod" || currentUser?.role === "manager" || currentUser?.role === "chef_finance";
  const canEdit = currentUser?.role === "mod";

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: userKeys.list(),
    queryFn: () => api.get("/users").then((r) => r.data),
    enabled: isPrivileged,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: User["role"] }) =>
      api.put(`/users/${id}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/users/${id}/active`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateUserForm) =>
      api.post("/users", {
        username: data.username,
        display_name: data.display_name,
        password: data.password,
        role: data.role,
        ...(data.email ? { email: data.email } : {}),
      }),
    onSuccess: () => {
      setShowCreateForm(false);
      setCreateForm({ username: "", display_name: "", password: "", role: "technician", email: "" });
      setCreateError(null);
      qc.invalidateQueries({ queryKey: userKeys.all });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setCreateError("Username already taken");
      } else if (status === 400) {
        setCreateError("Invalid role");
      } else {
        setCreateError("Failed to create user");
      }
    },
  });

  if (!currentUser || !isPrivileged) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <XCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">Access Denied</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            You do not have permission to view this page.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">User Directory</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {canEdit ? "Manage user roles and access" : "Directory roster of company staff"}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">New User</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCreateError(null);
              createMutation.mutate(createForm);
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Role <span className="text-red-500">*</span></label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email (optional)</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            {createError && (
              <div className="sm:col-span-2 text-sm text-red-600 dark:text-red-400">{createError}</div>
            )}
            <div className="sm:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {createMutation.isPending ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setCreateError(null); }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</div>
      ) : !users?.length ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Username</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Auth Source</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                      {/* User */}
                      <td className="px-4 py-3">
                        <Link href={`/profile/${u.id}`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                          {u.display_name}
                        </Link>
                        {u.email && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">{u.email}</p>
                        )}
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{u.username}</td>

                      {/* Role dropdown */}
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={!canEdit || isSelf || roleMutation.isPending}
                          onChange={(e) =>
                            roleMutation.mutate({
                              id: u.id,
                              role: e.target.value as User["role"],
                            })
                          }
                          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Auth Source badge */}
                      <td className="px-4 py-3">
                        {u.auth_source === "ldap" ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">ldap</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">local</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.is_active
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Toggle active */}
                      <td className="px-4 py-3 text-center">
                        {canEdit ? (
                          <button
                            onClick={() =>
                              activeMutation.mutate({ id: u.id, is_active: !u.is_active })
                            }
                            disabled={isSelf || activeMutation.isPending}
                            title={
                              isSelf
                                ? "Cannot deactivate yourself"
                                : u.is_active
                                ? "Deactivate user"
                                : "Activate user"
                            }
                            className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {u.is_active ? (
                              <ShieldOff className="w-4 h-4 text-slate-500 dark:text-slate-400 hover:text-red-500" />
                            ) : (
                              <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400 hover:text-green-500" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
