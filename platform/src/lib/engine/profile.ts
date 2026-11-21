import { stringify } from "yaml";

/** Données de profil saisies dans le formulaire (stockées en JSON dans user_settings.profile). */
export interface ProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  years_of_experience?: number | null;
  target_roles?: string[];
  work_mode?: string;
  countries?: string;
  salary_target?: string;
  salary_minimum?: string;
  salary_currency?: string;
  work_authorization?: string;
  deal_breakers?: string[];
}

export interface UserSettings {
  cv_md: string;
  profile: ProfileData;
  profile_md: string;
  output_language: string;
  spend_tier: string;
}

const LANG_NAMES: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ar: "Arabic",
};

export function languageName(code: string): string {
  return LANG_NAMES[code] ?? "French";
}

/** Même consigne que profile-language.mjs du moteur (outputLanguageInstruction). */
export function outputLanguageInstruction(code: string): string {
  const lang = languageName(code);
  return [
    `Write all human-facing output in ${lang}, including the full A–G`,
    `evaluation, regardless of the language of these instructions or the job`,
    `description. Keep market-specific terms when relevant, but explain them in ${lang}`,
    `when needed. The configured output language always wins over the job description's language.`,
  ].join(" ");
}

const compact = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0) &&
        !(typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0),
    ),
  ) as Partial<T>;

/** Construit le équivalent de config/profile.yml lu par le moteur. */
export function toProfileYaml(settings: UserSettings): string {
  const p = settings.profile ?? {};
  const doc = compact({
    candidate: compact({
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      location: p.location,
      linkedin: p.linkedin,
      years_of_experience: p.years_of_experience ?? undefined,
    }),
    target_roles: compact({ primary: p.target_roles }),
    compensation: compact({
      target_range: p.salary_target,
      currency: p.salary_currency,
      minimum: p.salary_minimum,
      location_flexibility: p.work_mode,
    }),
    location: compact({
      country: p.countries,
      visa_status: p.work_authorization,
    }),
    dealbreakers: p.deal_breakers,
    language: { output: settings.output_language || "fr" },
    spend_tier: settings.spend_tier || "standard",
  });
  return stringify(doc, { lineWidth: 0 });
}
