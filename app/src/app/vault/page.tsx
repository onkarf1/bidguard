"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Loader2, Vault } from "lucide-react";
import { friendlyError, useBidguard } from "@/lib/useBidguard";
import { USDC_MINT } from "@/lib/config";
import { fromBaseUnits, toBaseUnits, usd } from "@/lib/format";
import { cancelWithdrawIx, configPda, depositIx, requestWithdrawIx, withdrawIxs } from "@/lib/program";

type Power = { deposited: number; pending: number; committed: number; available: number; withdrawRequestedAt: number };

export default function VaultPage() {
  const { publicKey } = useWallet();
  const { program, connection, send } = useBidguard();
  const [power, setPower] = useState<Power | null>(null);
  const [wallet, setWallet] = useState(0);
  const [cooldown, setCooldown] = useState(600);
  const [dep, setDep] = useState("50");
  const [wd, setWd] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!publicKey) return;
    const [p, bal, cfg] = await Promise.all([
      fetch(`/api/vault/${publicKey.toBase58()}`, { cache: "no-store" }).then((r) => r.json()),
      connection.getTokenAccountBalance(getAssociatedTokenAddressSync(USDC_MINT, publicKey)).catch(() => null),
      program.account.config.fetchNullable(configPda()).catch(() => null),
    ]);
    setPower(p);
    setWallet(bal ? Number(bal.value.amount) : 0);
    if (cfg) setCooldown(cfg.withdrawCooldownSecs.toNumber());
  }, [publicKey, connection, program]);

  useEffect(() => {
    load();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [load]);

  async function run(name: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy("");
    }
  }

  if (!publicKey) {
    return (
      <div className="card mx-auto max-w-lg space-y-2 text-center">
        <Vault className="mx-auto h-8 w-8 text-brand" aria-hidden />
        <h1 className="text-xl font-bold">Bid Vault</h1>
        <p className="text-slate-400">Connect your wallet to deposit USDC and start bidding.</p>
      </div>
    );
  }
  const readyAt = power && power.pending > 0 ? (power.withdrawRequestedAt + cooldown) * 1000 : 0;
  const waitMs = readyAt - now;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bid Vault</h1>
        <p className="text-slate-400">Your bids are backed by USDC you deposit here. It stays in a vault only you and the auction program control. If you win, the price moves into escrow; otherwise it&apos;s yours to withdraw.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "Available to bid", v: power?.available ?? 0, hi: true },
          { k: "Leading bids (locked)", v: power?.committed ?? 0 },
          { k: "In vault", v: power?.deposited ?? 0 },
        ].map((s) => (
          <div key={s.k} className="card !p-4">
            <div className="text-xs text-slate-400">{s.k}</div>
            <div className={`text-2xl font-bold ${s.hi ? "text-brand" : ""}`}>{usd(s.v)}</div>
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Deposit</h2>
        <p className="text-sm text-slate-400">Wallet balance: {usd(wallet)} USDC{wallet === 0 && " (use “Get test USDC” in the top bar)"}</p>
        <div className="flex gap-2">
          <input type="number" min={1} step="0.01" className="input" value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Deposit amount in USDC" />
          <button className="btn-primary shrink-0" disabled={!!busy || !(Number(dep) > 0)} onClick={() => run("dep", async () => send([await depositIx(program, publicKey, toBaseUnits(Number(dep)))]), `Deposited ${dep} USDC.`)}>
            {busy === "dep" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Deposit
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Withdraw</h2>
        <p className="text-sm text-slate-400">
          Withdrawals have a {Math.round(cooldown / 60)}-minute cooldown, so nobody can pull funds out from under a winning bid. Money behind a bid you&apos;re leading stays locked until that auction ends.
        </p>
        {power && power.pending > 0 ? (
          <div className="space-y-2">
            <p className="text-sm">{usd(power.pending)} requested. {waitMs > 0 ? `Ready in ${Math.ceil(waitMs / 60000)} min.` : "Ready to withdraw."}</p>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={!!busy || waitMs > 0} onClick={() => run("wd", async () => send(await withdrawIxs(program, publicKey)), "Withdrawn to your wallet.")}>Withdraw now</button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("cancel", async () => send([await cancelWithdrawIx(program, publicKey)]), "Withdrawal cancelled.")}>Cancel request</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input type="number" min={0.01} step="0.01" className="input" placeholder={power ? fromBaseUnits(power.available).toFixed(2) : "0"} value={wd} onChange={(e) => setWd(e.target.value)} aria-label="Withdrawal amount in USDC" />
            <button className="btn-secondary shrink-0" disabled={!!busy || !(Number(wd) > 0) || toBaseUnits(Number(wd)) > (power?.available ?? 0)} onClick={() => run("req", async () => send([await requestWithdrawIx(program, publicKey, toBaseUnits(Number(wd)))]), "Withdrawal requested.")}>
              Request withdrawal
            </button>
          </div>
        )}
      </div>
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}
