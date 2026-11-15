import { ScanEye } from "lucide-react";

export type AiImage = { probability: number; verdict: "likely_real" | "uncertain" | "likely_ai"; source: string; markers: string[]; perImage: { index: number; probability: number; evidence: string[] }[] };

const LOOK = {
  likely_real: { label: "Looks like a real photo", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5" },
  uncertain: { label: "Might be AI-generated", cls: "text-amber-300 border-amber-500/30 bg-amber-500/5" },
  likely_ai: { label: "Likely AI-generated", cls: "text-rose-300 border-rose-500/30 bg-rose-500/5" },
};

/** Result of the AI Image Detector: provenance metadata + visual forensics. */
export function PhotoCheck({ r }: { r: AiImage }) {
  const look = LOOK[r.verdict];
  const evidence = Array.from(new Set([...r.markers, ...r.perImage.flatMap((p) => p.evidence)])).slice(0, 4);
  return (
    <div className={`rounded-lg border p-3 text-sm ${look.cls}`}>
      <div className="flex items-center gap-2 font-semibold">
        <ScanEye className="h-4 w-4" aria-hidden /> Photo authenticity: {look.label}
        <span className="ms-auto font-mono text-xs opacity-80">{Math.round(r.probability * 100)}% AI</span>
      </div>
      {r.verdict !== "likely_real" && evidence.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-slate-300">{evidence.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      <p className="mt-1.5 text-xs text-slate-500">{r.source === "metadata" ? "Based on provenance data inside the file." : "Based on visual analysis. A probability, not proof."}</p>
    </div>
  );
}
