import type { EmailSimulationParsed } from "./report";

export interface DelegationParsingConfig {
  instructions: string;
  examples: string;
  output_instructions: string;
}

export interface DelegationPreviewRequest {
  body_text: string;
  parser: "ai" | "local";
  settings: DelegationParsingConfig;
  model_chain?: string[];
}

export interface DelegationPreviewResult {
  success: boolean;
  parsed: EmailSimulationParsed | null;
  active_parser: "ai" | "local";
  warnings: string[];
  error?: string | null;
}
