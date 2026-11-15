"use client";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export type TraceEvent = { agent: string; status: "running" | "done" | "failed"; ms?: number; summary?: string };

const ORDER = ["orchestrator", "Listing Inspector", "AI Image Detector", "Price Sanity", "Seller Risk"];

/** Live view of the agent crew: each agent's status, latency and one-line finding. */
export function AgentTrace({ events }: { events: TraceEvent[] }) {
  const latest = new Map<string, TraceEvent>();
  for (const e of events) latest.set(e.agent, { ...latest.get(e.agent), ...e });
  const rows = ORDER.filter((a) => latest.has(a)).map((a) => latest.get(a)!);
  return (
    <ol className="space-y-2 font-mono text-xs" aria-live="polite">
      <AnimatePresence initial={false}>
      {rows.map((r) => (
        <motion.li key={r.agent} layout initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1, borderColor: r.status === "running" ? "rgba(251,191,36,0.5)" : r.status === "done" ? "rgba(52,211,153,0.35)" : "rgba(244,63,94,0.5)" }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
          {r.status === "running" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden /> : r.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-slate-200">{r.agent === "orchestrator" ? "Orchestrator" : r.agent}</span>
            {r.ms != null && <span className="ms-2 text-slate-500">{(r.ms / 1000).toFixed(1)}s</span>}
            {r.summary && <span className="block text-slate-400">{r.summary}</span>}
          </span>
        </motion.li>
      ))}
      </AnimatePresence>
    </ol>
  );
}
