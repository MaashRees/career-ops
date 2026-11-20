import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sonde pour l'hébergeur (Fly/Railway/Render…). Volontairement sans détail de configuration. */
export function GET() {
  return NextResponse.json({ ok: true });
}
