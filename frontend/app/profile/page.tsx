"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";

export default function ProfilePage() {
  const { user, setUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notifications_enabled ?? true);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: (data: { display_name: string; notifications_enabled: boolean }) =>
      api.patch("/users/me", data),
    onSuccess: (res) => {
      setProfileMsg("Profile updated successfully.");
      if (setUser && res?.data) {
        setUser(res.data);
      }
    },
    onError: () => setProfileMsg("Failed to update profile details."),
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Profile</h1>

        {/* Display name section */}
        <section className="bg-card rounded-xl shadow-sm p-6 mb-6 border border-border">
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
              className="w-full text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="notificationsEnabled"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-primary h-4 w-4"
            />
            <label htmlFor="notificationsEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enable Email Notifications
            </label>
          </div>
          {profileMsg && <p className="text-sm text-green-600 dark:text-green-400 mb-3">{profileMsg}</p>}
          <button
            onClick={() => {
              setProfileMsg(null);
              profileMutation.mutate({
                display_name: displayName,
                notifications_enabled: notificationsEnabled,
              });
            }}
            disabled={profileMutation.isPending}
            className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {profileMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </section>

        {/* Password section */}
        <section className="bg-card rounded-xl shadow-sm p-6 border border-border">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Password</h2>
          {user?.auth_source === "ldap" ? (
            <p className="text-sm text-muted italic">
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
                  className="w-full text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
              {passwordMsg && <p className="text-sm text-green-600 dark:text-green-400">{passwordMsg}</p>}
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
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
