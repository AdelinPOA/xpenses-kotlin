"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";

export default function ProfilePage() {
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: (name: string) => api.patch("/users/me", { display_name: name }),
    onSuccess: () => setProfileMsg("Display name updated."),
    onError: () => setProfileMsg("Failed to update display name."),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      api.post("/auth/change-password", data),
    onSuccess: () => {
      setPasswordMsg("Password changed successfully.");
      setPasswordError(null);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: () => {
      setPasswordError("Failed to change password. Check your current password.");
      setPasswordMsg(null);
    },
  });

  return (
    <AppShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Profile</h1>

        {/* Display name section */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Account Info</h2>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Username</label>
            <p className="text-sm text-slate-700 dark:text-slate-300">{user?.username}</p>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          {profileMsg && <p className="text-sm text-green-600 dark:text-green-400 mb-3">{profileMsg}</p>}
          <button
            onClick={() => { setProfileMsg(null); profileMutation.mutate(displayName); }}
            disabled={profileMutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {profileMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </section>

        {/* Password section */}
        <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Password</h2>
          {user?.auth_source === "ldap" ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              Your password is managed by your organization&apos;s directory.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPasswordError(null);
                if (newPassword !== confirmPassword) {
                  setPasswordError("Passwords do not match.");
                  return;
                }
                passwordMutation.mutate({ old_password: oldPassword, new_password: newPassword });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current Password</label>
                <input
                  required
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
              {passwordMsg && <p className="text-sm text-green-600 dark:text-green-400">{passwordMsg}</p>}
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {passwordMutation.isPending ? "Changing..." : "Change Password"}
              </button>
            </form>
          )}
        </section>
      </div>
    </AppShell>
  );
}
