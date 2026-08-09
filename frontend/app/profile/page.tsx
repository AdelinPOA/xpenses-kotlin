"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "next-intl";
import { LOCALES, type Locale } from "@/i18n/config";
import { useLocaleContext } from "@/i18n/LocaleProvider";

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  ro: "Română",
};

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const t = useTranslations("profile");
  const { locale, setLocale } = useLocaleContext();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notifications_enabled ?? true);
  const [language, setLanguage] = useState<Locale>((user?.language as Locale) || locale);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: (data: { display_name: string; notifications_enabled: boolean; language: string }) =>
      api.patch("/users/me", data),
    onSuccess: (res) => {
      setProfileMsg(t("profile_updated"));
      if (setUser && res?.data) {
        setUser(res.data);
        setLocale(res.data.language as Locale);
      }
    },
    onError: () => setProfileMsg(t("profile_update_failed")),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      api.post("/auth/change-password", data),
    onSuccess: () => {
      setPasswordMsg(t("password_changed"));
      setPasswordError(null);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: () => {
      setPasswordError(t("password_change_failed"));
      setPasswordMsg(null);
    },
  });

  return (
    <AppShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t("title")}</h1>

        {/* Display name section */}
        <section className="bg-card rounded-xl shadow-sm p-6 mb-6 border border-border">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t("account_info")}</h2>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("username")}</label>
            <p className="text-sm text-slate-700 dark:text-slate-300">{user?.username}</p>
          </div>
          <div className="mb-4">
            <label htmlFor="profile-display-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("display_name")}</label>
            <input
              id="profile-display-name"
              name="display_name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="profile-language" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("language")}</label>
            <select id="profile-language" name="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {LANGUAGE_LABELS[loc]}
                </option>
              ))}
            </select>
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
              {t("enable_notifications")}
            </label>
          </div>
          {profileMsg && <p role="status" aria-live="polite" className="text-sm text-green-600 dark:text-green-400 mb-3">{profileMsg}</p>}
          <button
            onClick={() => {
              setProfileMsg(null);
              profileMutation.mutate({
                display_name: displayName,
                notifications_enabled: notificationsEnabled,
                language,
              });
            }}
            disabled={profileMutation.isPending}
            className="min-h-11 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {profileMutation.isPending ? t("saving") : t("save_changes")}
          </button>
        </section>

        {/* Password section */}
        <section className="bg-card rounded-xl shadow-sm p-6 border border-border">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">{t("password_section")}</h2>
          {user?.auth_source === "ldap" ? (
            <p className="text-sm text-muted italic">
              {t("password_managed")}
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPasswordError(null);
                if (newPassword !== confirmPassword) {
                  setPasswordError(t("passwords_mismatch"));
                  return;
                }
                passwordMutation.mutate({ old_password: oldPassword, new_password: newPassword });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("current_password")}</label>
                <input id="current-password" name="current_password" autoComplete="current-password"
                  required
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("new_password")}</label>
                <input id="new-password" name="new_password" autoComplete="new-password"
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("confirm_password")}</label>
                <input id="confirm-password" name="confirm_password" autoComplete="new-password"
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              {passwordError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
              {passwordMsg && <p role="status" aria-live="polite" className="text-sm text-green-600 dark:text-green-400">{passwordMsg}</p>}
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="min-h-11 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {passwordMutation.isPending ? t("changing") : t("change_password")}
              </button>
            </form>
          )}
        </section>
      </div>
    </AppShell>
  );
}
