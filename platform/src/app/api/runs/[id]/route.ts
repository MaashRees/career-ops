import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sweepIfStale } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

/** État d'une analyse (sondé toutes les 2 s par la page de suivi). La RLS garantit qu'on ne voit que les siennes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.from("runs").select("*").eq("id", id).maybeSingle<Run>();
  if (!data) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const run = await sweepIfStale(createAdminClient(), data);
  return NextResponse.json({ status: run.status });
}
