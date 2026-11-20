import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import {
  adminEmails,
  allowedEmails,
  dailyRunLimit,
  fallbackProvider,
  globalDailyRunLimit,
  hasAnthropicKey,
  hasOpenRouterKey,
  maxTier,
  modelFor,
  primaryProvider,
} from "@/lib/env";
import { estimateCostUsd } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

interface RunAgg {
  user_id: string;
  status: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  created_at: string;
}

export default async function AdminPage() {
  await requireAdmin();
  const db = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since1 = Date.now() - 86_400_000;

  const [{ data: profiles }, { data: runs }] = await Promise.all([
    db.from("profiles").select("id, email, created_at").order("created_at"),
    db
      .from("runs")
      .select("user_id, status, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at")
      .gte("created_at", since30)
      .returns<RunAgg[]>(),
  ]);

  const rows = (profiles ?? []).map((p) => {
    const mine = (runs ?? []).filter((r) => r.user_id === p.id);
    const day = mine.filter((r) => new Date(r.created_at).getTime() >= since1).length;
    let cost = 0;
    let costKnown = true;
    for (const r of mine) {
      const c = estimateCostUsd(r.model, {
        input: r.input_tokens,
        output: r.output_tokens,
        cacheRead: r.cache_read_tokens,
        cacheWrite: r.cache_write_tokens,
      });
      if (c == null) {
        if (r.input_tokens + r.output_tokens > 0) costKnown = false;
      } else cost += c;
    }
    return { ...p, day, month: mine.length, failed: mine.filter((r) => r.status === "failed").length, cost, costKnown };
  });
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const primary = primaryProvider();
  const fallback = fallbackProvider();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Administration</h1>

      <section className="card space-y-2" aria-labelledby="cfg-title">
        <h2 id="cfg-title" className="font-semibold">Configuration (sans aucune clé affichée)</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Item k="Fournisseur principal" v={primary ?? "⚠ aucun"} />
          <Item k="Repli automatique" v={fallback ?? "non"} />
          <Item k="Clé Anthropic" v={hasAnthropicKey() ? "présente" : "absente"} />
          <Item k="Clé OpenRouter" v={hasOpenRouterKey() ? "présente" : "absente"} />
          {primary && (
            <>
              <Item k="Modèle économique" v={modelFor(primary, "economy")} />
              <Item k="Modèle standard" v={modelFor(primary, "standard")} />
              <Item k="Modèle premium" v={modelFor(primary, "premium")} />
            </>
          )}
          <Item k="Niveau max. autorisé" v={maxTier()} />
          <Item k="Limite / utilisateur / 24 h" v={dailyRunLimit() === 0 ? "illimitée" : String(dailyRunLimit())} />
          <Item k="Plafond global / 24 h" v={globalDailyRunLimit() === 0 ? "illimité" : String(globalDailyRunLimit())} />
          <Item k="Liste blanche e-mails" v={allowedEmails().length ? `${allowedEmails().length} adresse(s)` : "désactivée (invitations Supabase)"} />
          <Item k="Administrateurs" v={String(adminEmails().length)} />
        </dl>
      </section>

      <section className="card overflow-x-auto p-0" aria-labelledby="usage-title">
        <h2 id="usage-title" className="px-4 pt-4 font-semibold">Utilisation (30 derniers jours)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-2 font-medium">Utilisateur</th>
              <th className="px-4 py-2 font-medium">24 h</th>
              <th className="px-4 py-2 font-medium">30 j</th>
              <th className="px-4 py-2 font-medium">Échecs</th>
              <th className="px-4 py-2 font-medium">Coût estimé</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{r.email}</td>
                <td className="px-4 py-2">{r.day}</td>
                <td className="px-4 py-2">{r.month}</td>
                <td className="px-4 py-2">{r.failed}</td>
                <td className="px-4 py-2">{r.costKnown ? "" : "≥ "}${r.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-2 font-semibold" colSpan={4}>Total</td>
              <td className="px-4 py-2 font-semibold">${totalCost.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="hint px-4 pb-4">Estimation d'après les tarifs publics ; seule la facture d'Anthropic / OpenRouter fait foi.</p>
      </section>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
