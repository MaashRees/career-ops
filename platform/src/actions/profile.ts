"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { requireUser } from "@/lib/auth";
import type { ProfileData } from "@/lib/engine/profile";
import { clampTier, TIERS } from "@/lib/env";
import { QuotaError } from "@/lib/quota";
import { startRun } from "@/lib/start-run";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const MAX_CV_CHARS = 60_000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 15;

const str = (fd: FormData, key: string, max = 500): string => String(fd.get(key) ?? "").trim().slice(0, max);
const lines = (value: string, maxItems = 12): string[] =>
  value
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxItems);

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const years = Number.parseFloat(str(formData, "years_of_experience", 6).replace(",", "."));
  const profile: ProfileData = {
    full_name: str(formData, "full_name", 120),
    email: str(formData, "email", 200),
    phone: str(formData, "phone", 60),
    location: str(formData, "location", 160),
    linkedin: str(formData, "linkedin", 200),
    years_of_experience: Number.isFinite(years) && years >= 0 && years <= 60 ? years : null,
    target_roles: lines(str(formData, "target_roles", 1000), 8),
    work_mode: str(formData, "work_mode", 200),
    countries: str(formData, "countries", 200),
    salary_target: str(formData, "salary_target", 80),
    salary_minimum: str(formData, "salary_minimum", 80),
    salary_currency: str(formData, "salary_currency", 8),
    work_authorization: str(formData, "work_authorization", 200),
    deal_breakers: lines(str(formData, "deal_breakers", 1500), 12),
  };
  const lang = str(formData, "output_language", 5);
  const tier = clampTier(str(formData, "spend_tier", 20));

  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      profile,
      profile_md: str(formData, "profile_md", 8000),
      output_language: ["fr", "en", "es", "de", "it", "pt", "nl"].includes(lang) ? lang : "fr",
      spend_tier: (TIERS as readonly string[]).includes(tier) ? tier : "standard",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Enregistrement impossible." };
  revalidatePath("/profile");
  return { message: "Profil enregistré." };
}

export async function saveCv(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const cv = String(formData.get("cv_md") ?? "").replace(/\r\n/g, "\n").trim();
  if (cv.length > MAX_CV_CHARS) return { error: "CV trop long (maximum 60 000 caractères)." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, cv_md: cv, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: "Enregistrement impossible." };
  revalidatePath("/profile");
  revalidatePath("/");
  return { message: cv ? "CV enregistré." : "CV vidé." };
}

/** PDF → texte (sur le serveur, le fichier n'est PAS conservé) → conversion en markdown par l'IA, à valider. */
export async function uploadCv(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisis un fichier." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Fichier trop gros (5 Mo maximum)." };

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isText = name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/");
  if (!isPdf && !isText) return { error: "Formats acceptés : PDF, .md ou .txt." };

  let text: string;
  try {
    if (isPdf) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      if (pdf.numPages > MAX_PDF_PAGES) return { error: `PDF trop long (${MAX_PDF_PAGES} pages maximum pour un CV).` };
      text = (await extractText(pdf, { mergePages: true })).text;
    } else {
      text = await file.text();
    }
  } catch {
    return { error: "Impossible de lire ce fichier (PDF protégé ou corrompu ?). Colle le texte à la place." };
  }
  text = text.replace(/\u0000/g, "").trim();
  if (text.length < 100) return { error: "Aucun texte lisible (PDF scanné en image ?). Colle le texte à la place." };

  let runId: string;
  try {
    runId = await startRun(user, "cv_import", { text: text.slice(0, MAX_CV_CHARS) });
  } catch (e) {
    if (e instanceof QuotaError) return { error: e.message };
    console.error("[actions/profile] uploadCv", e);
    return { error: "Impossible de lancer la conversion. Réessaie dans un instant." };
  }
  redirect(`/runs/${runId}`);
}

/** Valide le CV converti (éventuellement retouché) et le remplace. */
export async function acceptImportedCv(runId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const cv = String(formData.get("cv_md") ?? "").replace(/\r\n/g, "\n").trim();
  if (cv.length < 100) return { error: "Le CV est vide." };
  if (cv.length > MAX_CV_CHARS) return { error: "CV trop long." };
  const supabase = await createClient();
  const { data: run } = await supabase.from("runs").select("id, kind").eq("id", runId).maybeSingle();
  if (!run || run.kind !== "cv_import") return { error: "Import introuvable." };
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, cv_md: cv, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: "Enregistrement impossible." };
  revalidatePath("/profile");
  redirect("/profile?cv=ok");
}
