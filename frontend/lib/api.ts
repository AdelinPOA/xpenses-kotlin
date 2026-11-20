import axios from "axios";
import type {
  ImportOrderPreview,
  Report,
  ReportCreatePayload,
} from "./types/report";
export type { ImportOrderPreview, ReportCreatePayload } from "./types/report";
import {
  classifyAuthEndpointFailure,
  isAuthLoginRequest,
  isAuthMeRequest,
  isAuthRefreshRequest,
  markAuthFailure,
  TERMINAL_AUTH_FAILURE_EVENT,
} from "./authSession";

export const API_BASE_URL =
  typeof window !== "undefined"
    ? "/api"
    : process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8080/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const AUTH_REFRESH_LOCK_NAME = "xpenses_auth_refresh";
const LAST_REFRESH_AT_KEY = "xpenses_last_auth_refresh_at";
let refreshPromise: Promise<void> | null = null;
// Once the refresh endpoint definitively rejects the session, later resource
// 401s from requests already in flight must not start another refresh cycle.
let refreshRejected = false;

function readLastRefreshAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = Number(window.localStorage.getItem(LAST_REFRESH_AT_KEY) || "0");
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function writeLastRefreshAt(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_REFRESH_AT_KEY, String(ts));
  } catch {
    // Best-effort cross-tab hint.
  }
}

export function refreshSessionSingleFlight(options?: {
  proactive?: boolean;
}): Promise<void> {
  if (refreshRejected) {
    const err = new Error("Session refresh rejected");
    markAuthFailure(err, "terminal");
    return Promise.reject(err);
  }
  if (refreshPromise) return refreshPromise;

  const proactive = Boolean(options?.proactive);
  const startedAt = Date.now();

  const runInsideLock = async (): Promise<void> => {
    const lastRefreshAt = readLastRefreshAt();
    if (proactive && Date.now() - lastRefreshAt < 60_000) return;
    if (!proactive && lastRefreshAt >= startedAt) return;

    await api.post("/auth/refresh");
    refreshRejected = false;
    writeLastRefreshAt(Date.now());
  };

  refreshPromise = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      await navigator.locks.request(AUTH_REFRESH_LOCK_NAME, runInsideLock);
    } else {
      await runInsideLock();
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function notifyTerminalAuthFailure(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TERMINAL_AUTH_FAILURE_EVENT));
  const { pathname, search } = window.location;
  if (pathname !== "/login") {
    window.location.assign(
      `/login?next=${encodeURIComponent(pathname + search)}`,
    );
  }
}

api.interceptors.response.use(
  (response) => {
    // A verified auth response means this module may belong to a new session
    // (e.g. login in place or another tab); ordinary resource success does not.
    const requestUrl = response.config.url;
    if (
      isAuthLoginRequest(requestUrl) ||
      isAuthMeRequest(requestUrl) ||
      isAuthRefreshRequest(requestUrl)
    ) {
      refreshRejected = false;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url;
    const endpointFailure = classifyAuthEndpointFailure(
      requestUrl,
      error.response?.status,
    );
    if (endpointFailure) markAuthFailure(error, endpointFailure);
    if (
      endpointFailure === "terminal" &&
      (isAuthRefreshRequest(requestUrl) ||
        (isAuthMeRequest(requestUrl) && originalRequest?._retry))
    ) {
      notifyTerminalAuthFailure();
    }

    if (error.response?.data) {
      const data = error.response.data;
      if (data.detail === undefined || data.detail === null) {
        data.detail = data.message ?? data.error;
      }
    }
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRefreshRequest(requestUrl) &&
      !isAuthLoginRequest(requestUrl)
    ) {
      if (refreshRejected) return Promise.reject(error);
      originalRequest._retry = true;

      try {
        await refreshSessionSingleFlight();
        return api(originalRequest);
      } catch (refreshError) {
        const refreshStatus = (
          refreshError as { response?: { status?: number } }
        )?.response?.status;
        const failureKind =
          classifyAuthEndpointFailure("/auth/refresh", refreshStatus) ??
          "transient";
        markAuthFailure(refreshError, failureKind);
        if (failureKind === "terminal") refreshRejected = true;
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

// ── Re-exports for backward compatibility ───────────────────────────────────
// Types are now in lib/types/, API functions in lib/api/.
// These re-exports keep existing imports from @/lib/api working.

export type { PagedResponse, Currency } from "./types/common";
export { CURRENCIES, isPagedResponse } from "./types/common";
export type {
  Receipt,
  Expense,
  BulkUploadError,
  BulkUploadResult,
  OCRScanResult,
} from "./types/expense";
export type {
  AdvancePayment,
  PendingAdvance,
  MileageRecord,
  MileageRates,
  Report,
  EmailSimulationIn,
  EmailSimulationOut,
  EmailSimulationParsed,
} from "./types/report";
export type { ReviewQueueItem } from "./types/reviewQueue";
export type { BulkStatusResult } from "./api/reviewQueue";
export type { User } from "./types/user";
export type {
  FuelType,
  UserVehicle,
  UserVehicleCreatePayload,
  UserVehicleUpdatePayload,
} from "./types/vehicle";
export type {
  DashboardStats,
  ManagerKpis,
  PendingReportSummary,
  PendingAdvanceSummary,
  ActivityFeedItem,
  ManagerDashboardStats,
} from "./types/dashboard";
export type {
  LdapConfig,
  LdapSyncResult,
  LdapTestResult,
  SmtpConfig,
  SmtpTestResult,
  ImapConfig,
  ImapTestResult,
  ImapIngestionRecovery,
  OcrConfig,
  OcrProvider,
  OcrProviderUpdate,
  OcrModel,
  OcrModelUpdate,
  OcrConfigUpdate,
  StorageConfig,
  StorageMigrationStatus,
  OCRComparisonStats,
  OCRComparisonRow,
  OCRComparisonHistoryResponse,
  FxMargins,
  FxProvidersConfig,
  FxTestResult,
  FxHealthStatus,
  FxProviderHealthItem,
  FxLastDbRate,
  FuelPriceHealthStatus,
  FuelProviderHealthItem,
  FuelLastDbPrice,
} from "./types/admin";

export interface ApiValidationError {
  detail?: string;
  errors?: Record<string, string>;
}
export type { Category } from "./types/expense";
export type { InsuranceFile } from "./types/insurance";
export type { SearchResult } from "./types/search";
export { bulkUploadExpenses, duplicateExpense } from "./api/expenses";
export { getReviewQueue, bulkReportStatus } from "./api/reviewQueue";
export {
  getOcrConfig,
  updateOcrConfig,
  testOcrModel,
  getOcrComparisons,
  getStorageConfig,
  updateStorageConfig,
  testStorageConfig,
  getStorageMigrationStatus,
  simulateEmailIngestion,
  getImapIngestionRecovery,
  retryImapIngestion,
  getFxProviders,
  updateFxProviders,
  testFxProvider,
  getFxStatus,
  checkFxProviders,
  getFuelPriceStatus,
  checkFuelPrices,
} from "./api/admin";

function isStandalonePwa(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined")
    return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export async function downloadBlob(
  url: string,
  params: Record<string, unknown>,
  filename: string,
): Promise<void> {
  const response = await api.get(url, { params, responseType: "blob" });
  const blob: Blob = response.data;

  if (
    isStandalonePwa() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    try {
      const file = new File([blob], filename, {
        type: blob.type || "application/octet-stream",
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.target = "_self";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function importOrder(bodyText: string): Promise<Report> {
  const { data } = await api.post<Report>("/reports/import-order", {
    body_text: bodyText,
  });
  return data;
}

export async function previewImportOrder(
  bodyText: string,
): Promise<ImportOrderPreview> {
  const { data } = await api.post<ImportOrderPreview>(
    "/reports/import-order/preview",
    {
      body_text: bodyText,
    },
  );
  return data;
}

export async function createReport(
  payload: ReportCreatePayload,
): Promise<Report> {
  const { data } = await api.post<Report>("/reports", payload);
  return data;
}

