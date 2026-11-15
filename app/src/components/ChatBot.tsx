"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Guardy, type GuardyMood } from "./Guardy";

type Msg = { role: "user" | "assistant"; content: string; links?: { label: string; href: string }[] };

const SUGGESTIONS_HOME = ["How does bidding work?", "Show me live auctions", "How do I get test USDC?", "How do you stop scams?"];
const SUGGESTIONS_AUCTION = ["Is this listing safe?", "What's the minimum bid?", "What happens if I win?", "What if it never arrives?"];
const GREETING: Msg = { role: "assistant", content: "Hi, I'm Guardy! 🛡️ I keep BidGuard auctions honest. Ask me how bidding works, whether a listing looks safe, or how to get started." };

/** Floating Guardy chat assistant, available on every page. */
export function ChatBot() {
  const pathname = usePathname();
  const auctionId = pathname.match(/^\/auction\/([1-9A-HJ-NP-Za-km-z]{32,50})/)?.[1];
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<GuardyMood>("happy");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState<{ full: string; shown: number } | null>(null);
  const [wave, setWave] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A friendly nudge once per visitor.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem("guardy-teaser") === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setTeaser(true), 3500);
    const h = setTimeout(() => setTeaser(false), 12000);
    return () => (clearTimeout(t), clearTimeout(h));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, typing, busy]);

  // Typewriter for Guardy's replies (mouth moves while typing).
  useEffect(() => {
    if (!typing) return;
    if (typing.shown >= typing.full.length) {
      setTyping(null);
      return;
    }
    const t = setTimeout(() => setTyping({ ...typing, shown: Math.min(typing.full.length, typing.shown + 3) }), 16);
    return () => clearTimeout(t);
  }, [typing]);

  function toggle() {
    setOpen((o) => !o);
    setTeaser(false);
    setWave((n) => n + 1);
    try {
      localStorage.setItem("guardy-teaser", "1");
    } catch {}
    setTimeout(() => inputRef.current?.focus(), 250);
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setMood("thinking");
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 800) })), auctionId }),
      });
      const j = await r.json();
      const reply: string = r.ok ? j.reply : j.error ?? "Something went wrong. Try again?";
      setMsgs((m) => [...m, { role: "assistant", content: reply, links: j.links ?? [] }]);
      setTyping({ full: reply, shown: 0 });
      setMood(r.ok ? j.mood : "warning");
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
      setMood("warning");
    } finally {
      setBusy(false);
    }
  }

  const suggestions = auctionId ? SUGGESTIONS_AUCTION : SUGGESTIONS_HOME;
  const last = msgs.length - 1;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Chat with Guardy"
            initial={{ opacity: 0, y: 30, scale: 0.9, originX: 1, originY: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex h-[min(620px,calc(100vh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <header className="relative flex items-center gap-3 overflow-hidden border-b border-slate-800 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-4 py-3">
              <div className="aurora -right-10 -top-10 h-32 w-32" aria-hidden />
              <div className="relative -my-2">
                <Guardy size={64} mood={mood} talking={!!typing} wave={wave % 2 === 1} />
              </div>
              <div className="relative">
                <div className="font-bold">Guardy</div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {busy ? "thinking…" : typing ? "typing…" : "Your BidGuard assistant"}</div>
              </div>
              <button onClick={toggle} className="relative ms-auto rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50" aria-label="Close chat"><X className="h-5 w-5" /></button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {msgs.map((m, i) => {
                const text = i === last && typing && m.role === "assistant" ? typing.full.slice(0, typing.shown) : m.content;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-md bg-brand text-slate-950" : "rounded-bl-md border border-slate-800 bg-slate-900 text-slate-100"}`}>
                      {text}
                      {m.links && m.links.length > 0 && !(i === last && typing) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.links.map((l) => (
                            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/20">{l.label} →</Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              {busy && (
                <div className="flex gap-1 px-2" aria-label="Guardy is thinking">
                  {[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-slate-500" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />)}
                </div>
              )}
              {msgs.length <= 2 && !busy && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {suggestions.map((s) => (
                    <motion.button key={s} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => send(s)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand">{s}</motion.button>
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-slate-800 p-3">
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask Guardy anything…" className="input !rounded-full !py-2" aria-label="Message Guardy" />
              <motion.button whileTap={{ scale: 0.9 }} disabled={busy || !input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-slate-950 disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </motion.button>
            </form>
            <p className="pb-2 text-center text-[10px] text-slate-500">AI answers can be wrong. Guardy will never ask for your seed phrase.</p>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2">
        <AnimatePresence>
          {teaser && !open && (
            <motion.button onClick={toggle} initial={{ opacity: 0, x: 20, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="mb-6 rounded-2xl rounded-br-sm border border-slate-700 bg-slate-900 px-3 py-2 text-sm shadow-xl">
              Hi! Need help? Ask me 👋
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          onClick={toggle}
          whileHover={{ scale: 1.08, rotate: -3 }}
          whileTap={{ scale: 0.92 }}
          className="relative grid place-items-center rounded-full"
          aria-label={open ? "Close chat with Guardy" : "Chat with Guardy"}
          aria-expanded={open}
        >
          <span className="absolute inset-2 rounded-full bg-slate-50/15 blur-xl" aria-hidden />
          <span className="sm:hidden"><Guardy size={52} mood={open ? mood : "neutral"} wave={teaser} talking={false} /></span>
          <span className="hidden sm:block"><Guardy size={68} mood={open ? mood : "neutral"} wave={teaser} talking={false} /></span>
        </motion.button>
      </div>
    </div>
  );
}
