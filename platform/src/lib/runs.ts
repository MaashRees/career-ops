import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings } from "./data.ts";
import { clampTier, type Tier } from "./env.ts";
import { numbersNotInSource } from "./engine/facts.ts";
import {
  buildCoverLetterSystemPrompt,
  buildCvImportSystemPrompt,
  buildDocumentUserMessage,
  buildEvaluationSystemPrompt,
  buildEvaluationUserMessage,
  buildTailoredCvSystemPrompt,
  type Depth,
} from "./engine/prompts.ts";
import { parseReport, unwrapFence, validateReport, withJdArchive } from "./engine/report.ts";
import { JdError, fetchPosting, urlKey } from "./jd/fetch.ts";
import { normalizeDashes } from "./text.ts";
import { complete, LlmError, type LlmResult } from "./llm/index.ts";
import type { Run, RunKind } from "./types.ts";

/** Échec attendu, avec un message déjà prêt à afficher à l'utilisateur. */
export class RunFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RunFailure";
    this.code = code;
  }
}

/** Une analyse « running » depuis plus longtemps que ça a été interrompue (redémarrage du serveur…). */
export const STALE_RUN_MS = 12 * 60 * 1000;

const MIN_PASTED_JD_CHARS = 200;
const MAX_JD_CHARS = 60_000;

type Db = SupabaseClient;

async function patchRun(db: Db, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("runs").update(patch).eq("id", id);
  if (error) console.error(`[runs] mise à jour de ${id} impossible : ${error.message}`);
}

function usagePatch(res: LlmResult) {
  return {
    provider: res.provider,
    model: res.model,
    input_tokens: res.usage.input,
    output_tokens: res.usage.output,
    cache_read_tokens: res.usage.cacheRead,
    cache_write_tokens: res.usage.cacheWrite,
  };
}

/** Appel IA qui enregistre toujours la consommation, même si le résultat est ensuite rejeté. */
async function callModel(db: Db, runId: string, req: Parameters<typeof complete>[0]): Promise<LlmResult> {
  try {
    const res = await complete(req);
    await patchRun(db, runId, usagePatch(res));
    return res;
  } catch (e) {
    if (e instanceof LlmError) {
      throw new RunFailure("llm_error", `Le service d'IA a échoué : ${e.message}`);
    }
    throw e;
  }
}

// ───────────────────────── évaluation ─────────────────────────

interface EvaluateInput {
  url?: string;
  jd_text?: string;
  depth?: Depth;
  override_dealbreaker?: boolean;
}

async function nextNum(db: Db, userId: string): Promise<number> {
  const { data } = await db
    .from("applications")
    .select("num")
    .eq("user_id", userId)
    .order("num", { ascending: false })
    .limit(1)
    .maybeSingle<{ num: number }>();
  return (data?.num ?? 0) + 1;
}

async function upsertApplication(
  db: Db,
  userId: string,
  args: { url: string | null; company: string; role: string; score: number | null; decision: string | null; legitimacy: string | null },
): Promise<string> {
  const key = args.url ? urlKey(args.url) : null;
  if (key) {
    const { data: existing } = await db
      .from("applications")
      .select("id, company, role")
      .eq("user_id", userId)
      .eq("url_key", key)
      .maybeSingle<{ id: string; company: string; role: string }>();
    if (existing) {
      await db
        .from("applications")
        .update({
          company: args.company || existing.company,
          role: args.role || existing.role,
          score: args.score,
          decision: args.decision,
          legitimacy: args.legitimacy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("user_id", userId);
      return existing.id;
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = await nextNum(db, userId);
    const { data, error } = await db
      .from("applications")
      .insert({
        user_id: userId,
        num,
        company: args.company || "Entreprise inconnue",
        role: args.role || "Poste (voir le rapport)",
        url: args.url,
        url_key: key,
        score: args.score,
        decision: args.decision,
        legitimacy: args.legitimacy,
        status: "Evaluated",
      })
      .select("id")
      .single<{ id: string }>();
    if (!error && data) return data.id;
    if (error && error.code !== "23505") throw new Error(`Création de la candidature impossible : ${error.message}`);
  }
  throw new Error("Impossible d'attribuer un numéro de candidature.");
}

async function runEvaluate(db: Db, run: Run) {
  const input = run.input as EvaluateInput;
  const settings = await loadSettings(db, run.user_id);
  if (!settings.cv_md.trim()) {
    throw new RunFailure("no_cv", "Ajoute ton CV dans « Profil » avant de lancer une analyse.");
  }

  const url = input.url?.trim() || null;
  let jdText = input.jd_text?.trim() ?? "";
  let hintCompany = "";
  let hintTitle = "";

  if (!jdText) {
    if (!url) throw new RunFailure("no_input", "Indique l'URL de l'offre ou colle son texte.");
    try {
      const posting = await fetchPosting(url);
      jdText = posting.text;
      hintCompany = posting.company ?? "";
      hintTitle = posting.title ?? "";
    } catch (e) {
      if (e instanceof JdError) throw new RunFailure(`jd_${e.code}`, e.message);
      throw e;
    }
  } else if (jdText.length < MIN_PASTED_JD_CHARS) {
    throw new RunFailure("jd_short", "Le texte collé est trop court pour être une offre : colle l'annonce complète.");
  }
  jdText = jdText.slice(0, MAX_JD_CHARS);

  const depth: Depth = input.depth === "full" ? "full" : "essential";
  const tier: Tier = clampTier(settings.spend_tier);

  const res = await callModel(db, run.id, {
    system: buildEvaluationSystemPrompt({ settings, depth }),
    user: buildEvaluationUserMessage({ jdText, url, overrideDealbreaker: !!input.override_dealbreaker }),
    tier,
    maxTokens: depth === "full" ? 24_000 : 12_000,
    allowTruncated: true,
  });

  // Aucun tiret long dans ce qui est généré (l'offre archivée, elle, reste telle quelle).
  let text = normalizeDashes(unwrapFence(res.text));
  const verdict = validateReport(text);
  if (!verdict.ok && res.truncated) {
    // Coupé AVANT la note : inexploitable. L'analyse a déjà coûté, on le dit clairement.
    throw new RunFailure("truncated", "L'analyse a dépassé la limite de longueur avant d'aboutir. Relance-la (le niveau « essentiel » est le plus court).");
  }
  if (!verdict.ok) {
    if (verdict.code === "needs_confirmation") {
      const detail = verdict.confirmation ?? "";
      throw new RunFailure(
        detail.startsWith("posting_unreadable") ? "jd_unreadable" : "needs_confirmation",
        detail.startsWith("posting_unreadable")
          ? "Le texte n'a pas l'air d'une offre d'emploi lisible. Colle l'annonce complète."
          : detail.replace(/^dealbreaker\s*/i, "") || "Cette offre enfreint une de tes règles.",
      );
    }
    throw new RunFailure("bad_report", `Analyse rejetée : ${verdict.reason} Relance-la.`);
  }

  if (res.truncated) {
    text = `${text.trimEnd()}\n\n> ⚠️ **Rapport tronqué** : le modèle a atteint sa limite de longueur, la fin du rapport manque (la note et les premiers blocs sont complets).`;
  }

  const parsed = parseReport(text);
  const company = parsed.company || hintCompany;
  const role = parsed.role || hintTitle;
  const applicationId = await upsertApplication(db, run.user_id, {
    url,
    company,
    role,
    score: parsed.score,
    decision: parsed.decision,
    legitimacy: parsed.legitimacy,
  });

  const { data: report, error } = await db
    .from("reports")
    .insert({
      user_id: run.user_id,
      application_id: applicationId,
      markdown: withJdArchive(text, jdText),
      jd_text: jdText,
      depth,
      score: parsed.score,
      provider: res.provider,
      model: res.model,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !report) throw new Error(`Enregistrement du rapport impossible : ${error?.message}`);

  await patchRun(db, run.id, {
    status: "done",
    application_id: applicationId,
    result_type: "report",
    result_id: report.id,
    finished_at: new Date().toISOString(),
  });
}

// ───────────────────────── documents ─────────────────────────

interface DocumentInput {
  application_id?: string;
  extra?: string;
}

async function loadApplicationContext(db: Db, run: Run) {
  const input = run.input as DocumentInput;
  if (!input.application_id) throw new RunFailure("no_application", "Candidature introuvable.");
  const { data: app } = await db
    .from("applications")
    .select("id, company, role")
    .eq("id", input.application_id)
    .eq("user_id", run.user_id)
    .maybeSingle<{ id: string; company: string; role: string }>();
  if (!app) throw new RunFailure("no_application", "Candidature introuvable.");
  const { data: report } = await db
    .from("reports")
    .select("markdown, jd_text")
    .eq("application_id", app.id)
    .eq("user_id", run.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ markdown: string; jd_text: string }>();
  if (!report) throw new RunFailure("no_report", "Évalue d'abord cette offre.");
  return { app, report, extra: input.extra };
}

async function runDocument(db: Db, run: Run, kind: "cover_letter" | "tailored_cv") {
  const settings = await loadSettings(db, run.user_id);
  if (!settings.cv_md.trim()) throw new RunFailure("no_cv", "Ajoute ton CV dans « Profil » d'abord.");
  const { app, report, extra } = await loadApplicationContext(db, run);

  const res = await callModel(db, run.id, {
    system: kind === "cover_letter" ? buildCoverLetterSystemPrompt(settings) : buildTailoredCvSystemPrompt(settings),
    user: buildDocumentUserMessage({ jdText: report.jd_text, reportMarkdown: report.markdown, extra }),
    tier: clampTier(settings.spend_tier),
    maxTokens: kind === "cover_letter" ? 2_500 : 8_000,
  });

  const markdown = normalizeDashes(unwrapFence(res.text));
  if (markdown.length < 200) throw new RunFailure("bad_document", "Le document généré est trop court. Relance-le.");
  const warnings = kind === "tailored_cv" ? numbersNotInSource(markdown, settings.cv_md) : [];

  const { data: doc, error } = await db
    .from("documents")
    .insert({ user_id: run.user_id, application_id: app.id, kind, markdown, warnings })
    .select("id")
    .single<{ id: string }>();
  if (error || !doc) throw new Error(`Enregistrement du document impossible : ${error?.message}`);

  await patchRun(db, run.id, {
    status: "done",
    application_id: app.id,
    result_type: "document",
    result_id: doc.id,
    finished_at: new Date().toISOString(),
  });
}

// ───────────────────────── import de CV ─────────────────────────

async function runCvImport(db: Db, run: Run) {
  const text = String((run.input as { text?: string }).text ?? "").trim();
  if (text.length < 100) throw new RunFailure("cv_short", "Le texte du CV est vide ou trop court.");
  const res = await callModel(db, run.id, {
    system: buildCvImportSystemPrompt(),
    user: `<cv_text>\n${text.slice(0, 80_000)}\n</cv_text>`,
    tier: "economy",
    maxTokens: 8_000,
  });
  await patchRun(db, run.id, {
    status: "done",
    output: normalizeDashes(unwrapFence(res.text)),
    finished_at: new Date().toISOString(),
  });
}

// ───────────────────────── orchestration ─────────────────────────

const HANDLERS: Record<RunKind, (db: Db, run: Run) => Promise<void>> = {
  evaluate: runEvaluate,
  cover_letter: (db, run) => runDocument(db, run, "cover_letter"),
  tailored_cv: (db, run) => runDocument(db, run, "tailored_cv"),
  cv_import: runCvImport,
};

/** Exécute une analyse déjà créée (status = running). Ne lève jamais : tout échec est écrit dans la ligne. */
export async function executeRun(db: Db, runId: string): Promise<void> {
  const { data: run } = await db.from("runs").select("*").eq("id", runId).maybeSingle<Run>();
  if (!run || run.status !== "running") return;
  try {
    await HANDLERS[run.kind](db, run);
  } catch (e) {
    const failure =
      e instanceof RunFailure
        ? e
        : new RunFailure("internal", "Erreur inattendue côté serveur. Réessaie ; si ça continue, préviens l'administrateur.");
    if (!(e instanceof RunFailure)) console.error(`[runs] ${run.kind} ${runId} :`, e);
    await patchRun(db, runId, {
      status: "failed",
      error: failure.message,
      error_code: failure.code,
      finished_at: new Date().toISOString(),
    });
  }
}

/** Marque comme échouée une analyse restée « running » trop longtemps (serveur redémarré en cours de route). */
export async function sweepIfStale(db: Db, run: Run): Promise<Run> {
  if (run.status !== "running") return run;
  if (Date.now() - new Date(run.created_at).getTime() < STALE_RUN_MS) return run;
  const patch = {
    status: "failed" as const,
    error: "Analyse interrompue (le serveur a redémarré). Relance-la.",
    error_code: "stale",
    finished_at: new Date().toISOString(),
  };
  await patchRun(db, run.id, patch);
  return { ...run, ...patch };
}
