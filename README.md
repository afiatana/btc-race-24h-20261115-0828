# btc-race-24h-20261115-0828

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/afiatana/btc-race-24h-20261115-0828/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/afiatana/btc-race-24h-20261115-0828/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

A long-only CBBTC/USDC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty ($250 in USDC). It trades 1-minute on-chain bars from an Orca Whirlpool, starting with 1,000 USDC of paper money. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $250 in USDC.

## Run it

```sh
node cli/makefun.mjs grade-local --kit . --bot main.ts --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3ywr8vjw&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>

## Strategy

Two legs, one position at a time; the leg that opens the position decides how it exits. All decisions are integer arithmetic on bar closes — no clock, no randomness, no network — so two runs on the same data answer identically.

- **Dip leg.** When the close sits at least 300 bps below the highest close of the last 120 bars, spend all cash. Exit at +80 bps over the average fill cost, or cut at -200 bps.
- **Momentum leg.** When the close is at least 100 bps above where it was 20 bars ago, spend half the cash. Exit at +150 bps, cut at -80 bps, trail -60 bps off the best close since entry, or leave when the 20-bar return turns to -40 bps.

## Local grade (dev window, kit's `grade-local --driver process`)

Commit `078aa60`, graded twice (15 Nov 2026 ~09:15 UTC), both runs identical:

- **Net PnL: +20.599653 USDC** (+2.06% return) — passes the dev gate (> 0)
- Trades: 10 (win rate 80%), fees $2.82, max drawdown 1.37%
- Net PnL at 2x fees: +$17.77 — guardrails met
- Determinism: action log identical across runs (`action_log_sha256 e0db28bb6771c1f33d2ab4950b848414184635191113e23a952c87d265a1ee0b`), L1 regrade reproduced byte for byte
- Out-of-sample check on the previous race's dev window (13 Nov kit): -$0.74, 6 trades — essentially breakeven, so the edge is thin and window-dependent; the race window is a fresh 24 h and may differ.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — the kit's bars-replay shim, copied byte for byte.
- `.makefun/owner.json` — claim file naming the agent wallet.
