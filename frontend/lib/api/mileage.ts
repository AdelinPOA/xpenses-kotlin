import api from "../api";
import type {
  MileageCreatePayload,
  MileageRecord,
  MileageUpdatePayload,
} from "../types/report";

const MILEAGE_MUTATION_TIMEOUT_MS = 45_000;

export async function createMileage(
  reportId: number,
  payload: MileageCreatePayload,
): Promise<MileageRecord> {
  const { data } = await api.post<MileageRecord>(
    `/reports/${reportId}/mileage`,
    payload,
    { timeout: MILEAGE_MUTATION_TIMEOUT_MS },
  );
  return data;
}

export async function updateMileage(
  reportId: number,
  mileageId: number,
  payload: MileageUpdatePayload,
): Promise<MileageRecord> {
  const { data } = await api.patch<MileageRecord>(
    `/reports/${reportId}/mileage/${mileageId}`,
    payload,
    { timeout: MILEAGE_MUTATION_TIMEOUT_MS },
  );
  return data;
}

export async function deleteMileage(
  reportId: number,
  mileageId: number,
): Promise<void> {
  await api.delete(`/reports/${reportId}/mileage/${mileageId}`, {
    timeout: MILEAGE_MUTATION_TIMEOUT_MS,
  });
}
