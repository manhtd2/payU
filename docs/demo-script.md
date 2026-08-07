# PayU — Demo video shooting script

Target runtime: **~2:50** (fits the 3-minute checkpoint limit with a small buffer).
Persona (matches README §12 / pitch deck): a 5-person Web3 dev shop pays 3 remote contractors weekly in USDC.

## Before you hit record

- [ ] **Two MetaMask accounts in the same browser profile**: Account A = "business" (funded with testnet USDC from the [Circle Faucet](https://faucet.circle.com/), network = Arc Testnet), Account B = "contractor" (**zero USDC balance on purpose** — this is what makes the gasless-withdraw beat real, not staged).
- [ ] Do a **dry run once end-to-end** before the real take — Arc's testnet swap/RPC can be flaky (see README §14), and `StreamsOverview` only shows streams created *from this browser* (localStorage-backed), so don't switch browsers/profiles mid-recording.
- [ ] Pre-fund Account A with enough testnet USDC to cover the batch (e.g. 3 × 5 USDC = 15, plus a margin).
- [ ] Have the deployed contract's Arcscan tab ready in a background tab (`https://testnet.arcscan.app/address/0x50C6388a9800CeE6762B0DDDCA9A196aDD1F31B9`) in case you want a quick cutaway proof-shot.
- [ ] Close unrelated browser tabs before recording (nothing sensitive visible).
- [ ] Decide narration language now (script below is in English for international judges — read it as-is, or translate to Vietnamese and keep the same beats/timing).

---

## Shot list

| Time | On-screen action | Say (voiceover) |
|---|---|---|
| 0:00–0:12 | Landing page (`/`). Sit on the hero for a beat, then move mouse over both CTA pills without clicking yet. | "Paying remote contractors on-chain today means waiting for a fixed payday, even though the work happened every day. PayU fixes that — it streams USDC to a contractor every second, on Arc." |
| 0:12–0:20 | Click **"I'm a business"** → lands on `/dashboard`. Point at the header: network pill + wallet pill (Account A). | "I'm a small dev shop paying three remote contractors. Here's my dashboard, connected on Arc Testnet." |
| 0:20–0:45 | Click **"↑ Upload CSV"** → switch to **"Wallet list (same terms)"** tab. Paste 3 contractor addresses, amount `5`, duration `0.02` (≈ 30 min, so it visibly streams during recording — see note below). Click **"Create 3 streams"**, approve the token spend, confirm the batch tx. | "I'll pay three contractors 5 USDC each, streaming over the next half hour. One approval, one batch transaction — and because Arc's gas is priced in stable USDC, I know exactly what this costs before I even sign." |
| 0:45–0:58 | While the tx confirms, hold on the wallet's pending-transaction UI for a second, then cut to the confirmed state. Point at **Creation history**: the new "Batch · 3 contractors" entry, expand the stream IDs row, click **copy-link** on one. | "Confirmed in under a second — that's Arc's deterministic finality. PayU logs every batch here, with a shareable link straight to each contractor's stream." |
| 0:58–1:10 | Scroll to **Streams overview**. Point at the ID column, the pill status chips (all "Active"). | "Three streams, three IDs, all live — each one paying out by the second." |
| 1:10–1:15 | Switch MetaMask to **Account B** (the contractor, zero USDC). Paste the copied link into the address bar → lands on `/withdraw?streamId=…`. | "Now switching to one of the contractors." |
| 1:15–1:35 | Contractor portal loads the stream. Let the camera sit on the **Number Ticker** balance for 3–4 seconds so it visibly ticks up, point at the progress bar and the glowing border. | "This contractor has never held a cent of USDC — but they can already see their balance streaming in, live, second by second." |
| 1:35–1:55 | Click **"Withdraw (gasless)"**. Sign the EIP-712 message in MetaMask (no gas prompt). Show the relayer confirmation message and the balance updating. | "They sign an authorization — no gas needed — and PayU's relayer submits the withdrawal for them, deducting a tiny fee from the payout itself. They just got paid without ever owning USDC." |
| 1:55–2:10 | *(Needs the Cancel button — see note below.)* Switch back to Account A → dashboard → click **Cancel** on one of the three streams. | "Say this contract ends early. As the business, I cancel — instantly, the streamed portion stays theirs to withdraw, and the untouched balance comes straight back to my treasury." |
| 2:10–2:20 | Point at the cancelled stream's status chip and the refunded treasury balance metric ticking up. | "No disputes, no waiting — it settles the moment I cancel." |
| 2:20–2:40 | Cut to the landing page or a slide with the GitHub/live demo links. | "That's PayU — programmable, per-second contractor payments, built on Arc. Live on Testnet at getpayu.vercel.app, code on GitHub." |
| 2:40–2:50 | End card: logo + tagline. | "Thanks for watching." |

**Note on duration**: pick a stream duration you can visibly demo (`0.02` days ≈ 29 minutes for the batch is one option, but for the balance to *noticeably* tick up in the ~20 seconds you're on camera, an even shorter duration reads better on screen — e.g. set duration to `0.005` days (~7 minutes) for the single demo stream or the batch, so the Number Ticker and progress bar move visibly within your shot).

---

## Fallback if something breaks live

- If a testnet tx hangs or the RPC rate-limits mid-recording: cut, wait, resume — don't force through a stuck UI on camera.
- Keep one **successful pre-recorded take of the batch-create + withdraw flow** as backup B-roll in case the live attempt fails during the real recording session.
- If gasless withdrawal fails (relayer down): fall back to the plain **"Withdraw"** button and adjust the line to "paying their own gas in USDC" instead — still a valid, honest demo.
