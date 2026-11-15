# BidGuard

**Live auctions you can trust.** AI agents vet every listing, every bid is backed by a deposit, and escrow makes sure the seller ships. Built on Solana.

🔗 **Live demo (Solana devnet):** https://bidguard-app.vercel.app

---

## The problem

Live and social auctions are full of scams and broken promises:

- **Fake listings.** Stock photos, AI-generated photos, or someone else's pictures of an item the seller doesn't own.
- **Fake bids.** People bid and vanish, or sellers bid up their own items.
- **No delivery.** The buyer pays and nothing ships, or the item doesn't match the listing.

## How BidGuard fixes it

| Problem | BidGuard |
|---|---|
| Fake or AI-generated listings | An **agent crew** checks photos, price and seller history before anything goes live and gives a **Trust Score** with plain-English reasons. Borderline listings go to a **human moderator**. |
| Bids that vanish | Bids come from your **Bid Vault**, a USDC deposit held by the program. A bid you can't cover is rejected. |
| Bid manipulation | Bids are **signed in your wallet** (instant, no fee) and the winning signature is **verified on-chain** at settlement. Late bids extend the clock (**soft close**). |
| Seller doesn't ship | The winner's payment sits in **escrow**. Sellers post a **bond** that goes to the buyer if they don't ship in time. |
| Item not as described | The buyer can **open a dispute** before releasing payment. AI advises; a human arbiter decides. |

### The agent crew

| Agent | What it checks |
|---|---|
| **Listing Inspector** | Do the photos show the item described? Stock or catalog photos? A photo already used by another seller (perceptual hash)? |
| **AI Image Detector** | Was the photo made by an AI image tool? Scans the original file for provenance (IPTC `trainedAlgorithmicMedia`, C2PA Content Credentials, Stable Diffusion / ComfyUI metadata) and runs a visual forensics pass (warped text, melted geometry, impossible lighting). |
| **Price Sanity** | Is the starting price a lure (a "$60 MacBook")? |
| **Seller Risk** | Wallet age and activity, who funded the wallet (sybil clusters), on-chain sales and lost disputes. |

The agents run in parallel and stream their progress to the seller. Their findings combine into the Trust Score:
`approve` (≥ 75), `approve with warning` (≥ 55), `hold for a moderator` (≥ 35) or `reject`. A listing whose photos look AI-generated is never approved automatically.
Detection is probabilistic: the score is a set of risk signals, not a verdict, and a person makes the final call on anything held.

---

## How it works

```
Seller ── listing ──▶ Agent crew ──▶ Trust Score ──▶ (moderator if held)
                                                        │ operator co-signs
                                                        ▼
                                      create_auction (seller posts bond) ──▶ live room
Bidders ── deposit ──▶ Bid Vault (on-chain)                                     │
Bidders ── signed bids (gas-free) ──▶ auction engine (atomic, soft close, SSE) ─┘
                                                        │ timer ends
                                                        ▼
            settle_auction: Ed25519-verified winning bid, vault ──▶ escrow
                                                        │
       seller ships ──▶ carrier oracle: delivered ──▶ buyer releases / review window ends
                                                        ▼
                       seller paid (minus 2.5% fee) + bond back ── or ── dispute ──▶ arbiter
```

### On-chain program (`programs/bidguard`, Anchor)

- **Bid Vault:** `deposit`, `request_withdraw` / `withdraw` (cooldown, so funds can't be pulled out from under a winning bid), `set_agent` (an optional bidding agent with a spending cap).
- **Auctions:** `create_auction` needs the operator's co-signature (only agent-vetted listings) and takes the seller's bond. `settle_auction` checks the winning bid's Ed25519 signature through the instructions sysvar, rebuilds the exact signed message, and moves the price from the winner's vault into escrow. `cancel_unsold` returns the bond.
- **Escrow:** `mark_shipped` → `mark_delivered` (carrier oracle) → `confirm_delivery` or `release_after_timeout`. `refund_unshipped` refunds the buyer and gives them the seller's bond. `raise_dispute` → `resolve_dispute` (arbiter splits funds; the bond is slashed if the buyer wins).
- **Reputation:** a per-seller profile counts completed sales, lost disputes and failed shipments, and feeds Seller Risk.

Program ID (devnet): `6upAUdnE4srVXtYEw1AMhxBxmoZLZ45sJq9dMgRwcp8`

### Web app (`app/`, Next.js 14)

| Path | What it does |
|---|---|
| `/` | Live and recently ended auctions |
| `/sell` | Create a listing, watch the agents work, post the bond and go live |
| `/auction/[id]` | Live room: countdown, signed bidding, live activity, trust report, escrow actions |
| `/vault` | Deposit, see available bidding power, request and complete withdrawals |
| `/admin` | Moderator queue for held listings and the dispute arbiter queue (token-protected) |
| `src/lib/agents.ts` | The agent crew and Trust Score |
| `src/lib/auctions.ts` | Auction engine: signature checks, bidding power, atomic bids, soft close, settlement |
| `src/lib/provenance.ts` | AI-image provenance scanner (runs in the browser on the original file) |

**Guardy**, the chrome shield mascot, is the in-app assistant (bottom right on every page). It knows the platform rules, the live auctions and, on an auction page, that listing's Trust Score and reasons. It can't move money and never asks for keys.

The UI is black and white with a **dark / light theme** switch (remembered per visitor; first visit follows the OS), and an animated layer (framer-motion) that respects "reduce motion".

**Stack:** Solana + Anchor 0.31, Next.js 14, MongoDB Atlas (live state), Server-Sent Events, Gemini (agents), Vercel.

---

## Try it (devnet, no install)

1. Install [Phantom](https://phantom.com/download) and switch it to devnet: **Settings → Developer Settings → Testnet Mode → Solana Devnet**.
2. Get free devnet SOL for fees at https://faucet.solana.com.
3. Open the live demo, connect your wallet and click **Get test USDC**.
4. **Sell:** go to **Sell**, add real photos of something you own, submit, and watch the agents score it.
5. **Bid:** with a second Phantom account, open **Bid Vault**, deposit, then bid in the auction room. Bid in the last 30 seconds to see the clock extend.
6. When the timer ends, the auction settles on-chain. The seller marks it shipped, **Check carrier tracking** reports delivery, and the buyer releases payment.

Everything runs on devnet with test USDC: no real money is involved.

---

## Run it yourself

**Prerequisites:** Node.js 20.18+ (22 recommended), Yarn, Rust, Solana CLI 2.1, Anchor 0.31.1, a MongoDB Atlas cluster and a Gemini API key.

```bash
git clone https://github.com/onkarf1/trustlink.git bidguard
cd bidguard
yarn install && (cd app && npm install)

anchor build
anchor test                                   # 9 program tests on a local validator

# Deploy to devnet (needs ~4 devnet SOL in ~/.config/solana/id.json)
anchor deploy --provider.cluster devnet
yarn setup                                    # operator/arbiter keys, test USDC mint, config → app/.env.local
```

Then add `MONGODB_URI`, `GEMINI_API_KEY` and `ADMIN_TOKEN` to `app/.env.local` (see `app/.env.example`) and run:

```bash
cd app && npm run dev                         # http://localhost:3000
```

**Demo data:** `yarn seed` lists real items (freely licensed photos in `app/public/samples`, credits in `CREDITS.md`) through the full pipeline and places opening bids from demo bidders. On `/sell`, **Try a sample item** fills in one of these items.

**End-to-end test** (with the app running): `yarn e2e` creates fresh wallets and goes through listing → agent vetting → moderator → on-chain auction → deposits → bid rules → soft close → settlement → shipping → carrier delivery → payout.

Keys live only in `app/.env.local` and `.keys/` (both gitignored).

---

## Limits of this prototype

- Devnet with a test USDC mint. The carrier oracle is mocked: any tracking number reads as delivered.
- AI checks are probabilistic. Metadata proves AI generation when present, but can be stripped; the visual check gives a probability, not proof.
- The operator key is a single server key. In production it would be a multisig, with the arbiter as a separate multisig.

## License

MIT
