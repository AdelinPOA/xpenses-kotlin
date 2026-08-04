import axios from "axios";

export const API_BASE_URL = typeof window !== "undefined"
  ? "/api"
  : (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api");

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.data) {
      const data = error.response.data;
      if (data.detail === undefined || data.detail === null) {
        data.detail = data.message ?? data.error;
      }
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/refresh" || originalRequest.url === "/auth/login") {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post("/auth/refresh");
        processQueue(null, "refreshed");
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Re-exports for backward compatibility ───────────────────────────────────
// Types are now in lib/types/, API functions in lib/api/.
// These re-exports keep existing imports from @/lib/api working.

export type { PagedResponse, Currency } from "./types/common";
export { CURRENCIES, isPagedResponse } from "./types/common";
export type { Receipt, Expense, BulkUploadError, BulkUploadResult, OCRScanResult } from "./types/expense";
export type { AdvancePayment, PendingAdvance, MileageRecord, MileageRates, Report, EmailSimulationIn, EmailSimulationOut, EmailSimulationParsed } from "./types/report";
export type { ReviewQueueItem } from "./types/reviewQueue";
export type { User } from "./types/user";
export type { DashboardStats, ManagerKpis, PendingReportSummary, PendingAdvanceSummary, ActivityFeedItem, ManagerDashboardStats } from "./types/dashboard";
export type { LdapConfig, LdapSyncResult, LdapTestResult, SmtpConfig, SmtpTestResult, ImapConfig, ImapTestResult, OcrConfig, StorageConfig, StorageMigrationStatus, OCRComparisonStats, OCRComparisonRow, OCRComparisonHistoryResponse, FxMargins } from "./types/admin";

export interface ApiValidationError {
  detail?: string;
  errors?: Record<string, string>;
}
export type { InventoryItem, InventoryItemCreate, InventoryItemUpdate, InventoryRequest, InventoryRequestCreate, InventoryRejectBody, InventoryApproveResponse } from "./types/inventory";
export type { Category } from "./types/expense";
export type { InsuranceFile } from "./types/insurance";
export type { SearchResult } from "./types/search";
export { bulkUploadExpenses, duplicateExpense } from "./api/expenses";
export { getReviewQueue } from "./api/reviewQueue";
export { getOcrConfig, updateOcrConfig, testOcrConfig, getOcrComparisons, getStorageConfig, updateStorageConfig, testStorageConfig, getStorageMigrationStatus, simulateEmailIngestion } from "./api/admin";

function isStandalonePwa(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export async function downloadBlob(
  url: string,
  params: Record<string, unknown>,
  filename: string
): Promise<void> {
  const response = await api.get(url, { params, responseType: "blob" });
  const blob: Blob = response.data;

  if (isStandalonePwa() && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
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
