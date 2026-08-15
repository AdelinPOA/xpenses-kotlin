import type { OcrConfig, OCRComparisonHistoryResponse, StorageConfig, StorageMigrationStatus, FxProvidersConfig, FxTestResult } from "@/lib/types/admin";
import api from "@/lib/api";

export async function getFxProviders(): Promise<FxProvidersConfig> {
  const { data } = await api.get("/settings/fx-providers");
  return data;
}

export async function updateFxProviders(providers: string[]): Promise<FxProvidersConfig> {
  const { data } = await api.patch("/settings/fx-providers", { providers });
  return data;
}

export async function testFxProvider(currency: string, date?: string): Promise<FxTestResult> {
  const { data } = await api.post("/settings/fx-providers/test", { currency, date });
  return data;
}

export async function getOcrConfig(): Promise<OcrConfig> {
  const { data } = await api.get("/settings/ocr");
  return data;
}

export async function updateOcrConfig(config: Partial<OcrConfig>): Promise<OcrConfig> {
  const { data } = await api.patch("/settings/ocr", config);
  return data;
}

export async function testOcrConfig(payload: { gemini_api_key?: string | null; provider?: string }): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/settings/ocr/test", payload);
  return data;
}

export async function getOcrComparisons(): Promise<OCRComparisonHistoryResponse> {
  const { data } = await api.get("/ocr/comparison");
  return data;
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const { data } = await api.get("/settings/storage");
  return data;
}

export async function updateStorageConfig(config: StorageConfig, migrateExisting: boolean = false): Promise<StorageConfig> {
  const { data } = await api.patch(`/settings/storage?migrate_existing=${migrateExisting}`, config);
  return data;
}

export async function testStorageConfig(config: StorageConfig): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post("/settings/storage/test", config);
  return data;
}

export async function getStorageMigrationStatus(): Promise<StorageMigrationStatus> {
  const { data } = await api.get("/settings/storage/migration-status");
  return data;
}

import type { EmailSimulationIn, EmailSimulationOut } from "@/lib/types/report";

export async function simulateEmailIngestion(payload: EmailSimulationIn): Promise<EmailSimulationOut> {
  const { data } = await api.post<EmailSimulationOut>("/settings/imap/simulate", payload);
  return data;
}
