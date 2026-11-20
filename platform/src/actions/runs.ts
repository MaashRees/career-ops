"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { QuotaError } from "@/lib/quota";
import { createClient } from "@/lib/supabase/server";
import { startRun } from "@/lib/start-run";
import type { FormState } from "./auth";

function fail(e: unknown): FormState {
  if (e instanceof QuotaError) return { error: e.message };
  console.error("[actions/runs]", e);
  return { error: "Impossible de lancer l'analyse. Réessaie dans un instant." };
}

export async function startEvaluation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const url = String(formData.get("url") ?? "").trim();
  const jdText = String(formData.get("jd_text") ?? "").trim();
  const depth = formData.get("depth") === "full" ? "full" : "essential";
  if (!url && !jdText) return { error: "Colle l'URL de l'offre ou le texte de l'annonce." };
  if (url && !/^https?:\/\//i.test(url)) return { error: "L'URL doit commencer par http:// ou https://." };

  let runId: string;
  try {
    runId = await startRun(user, "evaluate", { url: url || undefined, jd_text: jdText || undefined, depth });
  } catch (e) {
    return fail(e);
  }
  redirect(`/runs/${runId}`);
}

async function ownedApplication(applicationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("applications").select("id").eq("id", applicationId).maybeSingle();
  return data?.id as string | undefined;
}

export async function startDocument(
  applicationId: string,
  kind: "cover_letter" | "tailored_cv",
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!(await ownedApplication(applicationId))) return { error: "Candidature introuvable." };
  const extra = String(formData.get("extra") ?? "").trim().slice(0, 1000);
  let runId: string;
  try {
    runId = await startRun(user, kind, { application_id: applicationId, extra: extra || undefined }, applicationId);
  } catch (e) {
    return fail(e);
  }
  redirect(`/runs/${runId}`);
}

/** Relance l'analyse COMPLÈTE d'une candidature à partir de l'offre archivée (sans retélécharger la page). */
export async function reEvaluateFull(applicationId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: app } = await supabase.from("applications").select("id, url").eq("id", applicationId).maybeSingle();
  if (!app) return { error: "Candidature introuvable." };
  const { data: report } = await supabase
    .from("reports")
    .select("jd_text")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let runId: string;
  try {
    runId = await startRun(
      user,
      "evaluate",
      { url: app.url ?? undefined, jd_text: report?.jd_text || undefined, depth: "full" },
      applicationId,
    );
  } catch (e) {
    return fail(e);
  }
  redirect(`/runs/${runId}`);
}

/** « Évaluer quand même » après un refus pour règle bloquante (dealbreaker). */
export async function evaluateAnyway(runId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: run } = await supabase.from("runs").select("kind, input").eq("id", runId).maybeSingle();
  if (!run || run.kind !== "evaluate") return { error: "Analyse introuvable." };
  let newId: string;
  try {
    newId = await startRun(user, "evaluate", { ...(run.input as object), override_dealbreaker: true });
  } catch (e) {
    return fail(e);
  }
  redirect(`/runs/${newId}`);
}
