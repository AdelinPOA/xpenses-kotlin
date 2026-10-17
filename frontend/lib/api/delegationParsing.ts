import api from "@/lib/api";
import type {
  DelegationParsingConfig,
  DelegationPreviewRequest,
  DelegationPreviewResult,
} from "@/lib/types/delegationParsing";

export async function getDelegationParsingConfig(): Promise<DelegationParsingConfig> {
  const { data } = await api.get<DelegationParsingConfig>("/settings/imap/parsing");
  return data;
}

export async function updateDelegationParsingConfig(
  config: DelegationParsingConfig,
): Promise<DelegationParsingConfig> {
  const { data } = await api.patch<DelegationParsingConfig>("/settings/imap/parsing", config);
  return data;
}

export async function previewDelegationEmail(
  request: DelegationPreviewRequest,
): Promise<DelegationPreviewResult> {
  const { data } = await api.post<DelegationPreviewResult>("/settings/imap/preview", request);
  return data;
}
