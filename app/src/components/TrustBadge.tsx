export function trustColor(score: number) {
  return score >= 75 ? "#34d399" : score >= 55 ? "#fbbf24" : score >= 35 ? "#fb923c" : "#f87171";
}

/** Circular Trust Score badge. */
export function TrustBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? 40 : size === "lg" ? 88 : 56;
  return (
    <span
      className="trust-ring relative inline-grid shrink-0 place-items-center rounded-full"
      style={{ width: px, height: px, ["--v" as string]: score, ["--c" as string]: trustColor(score) }}
      role="img"
      aria-label={`Trust score ${score} out of 100`}
    >
      <span className="grid place-items-center rounded-full bg-slate-950" style={{ width: px - 8, height: px - 8 }}>
        <span className={`font-bold ${size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-base"}`} style={{ color: trustColor(score) }}>
          {score}
        </span>
      </span>
    </span>
  );
}
