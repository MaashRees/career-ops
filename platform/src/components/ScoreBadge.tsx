import { scoreBand } from "@/lib/states";

export function ScoreBadge({ score }: { score: number | null }) {
  const band = scoreBand(score);
  if (band === "none") return <span className="badge">Non noté</span>;
  const cls = band === "strong" ? "badge-strong" : band === "good" ? "badge-good" : "badge-weak";
  return <span className={`badge ${cls}`}>{score!.toFixed(1)} / 5</span>;
}
