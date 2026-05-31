"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { User } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { Shield, ShieldOff, XCircle } from "lucide-react";

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

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: userKeys.list(),
    queryFn: () => api.get("/users").then((r) => r.data),
    enabled: currentUser?.role === "mod",
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

  if (!currentUser || currentUser.role !== "mod") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <XCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700">Access Denied</h2>
          <p className="text-slate-500 text-sm mt-2">
            You do not have permission to view this page.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage user roles and access
        </p>
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm mt-8">Loading...</div>
      ) : !users?.length ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Username</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                    {/* User */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.display_name}</p>
                      {u.email && (
                        <p className="text-xs text-slate-400">{u.email}</p>
                      )}
                    </td>

                    {/* Username */}
                    <td className="px-4 py-3 text-slate-500">{u.username}</td>

                    {/* Role dropdown */}
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf || roleMutation.isPending}
                        onChange={(e) =>
                          roleMutation.mutate({
                            id: u.id,
                            role: e.target.value as User["role"],
                          })
                        }
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Toggle active */}
                    <td className="px-4 py-3 text-center">
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
                        className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {u.is_active ? (
                          <ShieldOff className="w-4 h-4 text-slate-500 hover:text-red-500" />
                        ) : (
                          <Shield className="w-4 h-4 text-slate-500 hover:text-green-500" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
