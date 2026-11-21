import type { ProfileData } from "./engine/profile.ts";

export type RunKind = "evaluate" | "cover_letter" | "tailored_cv" | "cv_import";
export type RunStatus = "running" | "done" | "failed";

export interface Application {
  id: string;
  user_id: string;
  num: number;
  company: string;
  role: string;
  url: string | null;
  url_key: string | null;
  score: number | null;
  decision: string | null;
  legitimacy: string | null;
  status: string;
  notes: string;
  applied_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  user_id: string;
  application_id: string;
  markdown: string;
  jd_text: string;
  depth: "essential" | "full";
  score: number | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  application_id: string;
  kind: "cover_letter" | "tailored_cv";
  markdown: string;
  warnings: string[];
  created_at: string;
}

export interface Run {
  id: string;
  user_id: string;
  kind: RunKind;
  status: RunStatus;
  input: Record<string, unknown>;
  application_id: string | null;
  result_type: "report" | "document" | null;
  result_id: string | null;
  output: string | null;
  error: string | null;
  error_code: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  created_at: string;
  finished_at: string | null;
}

export interface SettingsRow {
  user_id: string;
  cv_md: string;
  profile: ProfileData;
  profile_md: string;
  output_language: string;
  spend_tier: string;
  updated_at: string;
}
