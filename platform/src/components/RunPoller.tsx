"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Interroge l'état d'une analyse toutes les 2 s ; recharge la page dès qu'elle est terminée. */
export function RunPoller({ runId, kindLabel }: { runId: string; kindLabel: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { status: string };
          if (data.status !== "running" && !stopped) {
            stopped = true;
            router.refresh();
            return;
          }
        }
      } catch {
        // réseau instable : on réessaie au prochain tour
      }
    };
    const id = setInterval(poll, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [runId, router]);

  return (
    <div className="card flex items-center gap-4" role="status" aria-live="polite">
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold">{kindLabel} en cours…</p>
        <p className="hint">
          {seconds < 5
            ? "Démarrage."
            : "L'IA travaille. Une analyse prend en général 30 s à 2 min. Tu peux laisser cette page ouverte."}{" "}
          ({seconds} s)
        </p>
      </div>
    </div>
  );
}
