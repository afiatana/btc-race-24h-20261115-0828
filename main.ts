// btc-race-24h-20261115-0828: a two-leg long-only CBBTC/USDC bot.
//
// Leg 1 ("dip"): when the close sits at least 300 bps below the highest close
// of the last 120 bars, spend all cash. A sharp fall that far below its own
// recent high usually snaps back at least a little; exit at +80 bps over the
// average fill cost, or cut at -200 bps.
//
// Leg 2 ("momentum"): when the close is at least 100 bps above where it was
// 20 bars ago, spend half the cash. A genuine 20-minute push tends to carry a
// bit further; exit at +150 bps, cut at -80 bps, trail -60 bps off the best
// close since entry, or leave when the 20-bar return turns to -40 bps.
//
// Only one leg can hold at a time (the replay allows a single open position),
// and the leg that opened the position decides how it exits. Everything is
// integer arithmetic on the bar closes, no clock, no randomness, no network,
// so two runs on the same data answer byte for byte alike.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10000n;

// Dip leg.
const DIP_WINDOW = 120; // bars, high looked back over this many closes plus the current one
const DIP_BPS = -300n; // buy when (close - window high) is this far below the high, in bps
const DIP_TAKE_BPS = 80n; // exit a dip position this far above its average cost
const DIP_STOP_BPS = -200n; // or cut it this far below its average cost

// Momentum leg.
const MOM_LOOKBACK = 20; // bars for the entry return
const MOM_ENTRY_BPS = 100n; // buy when the 20-bar return reaches this
const MOM_SIZE_BPS = 5000n; // spend this share of cash on a momentum entry
const MOM_TAKE_BPS = 150n;
const MOM_STOP_BPS = -80n;
const MOM_TRAIL_BPS = -60n; // exit when the close falls this far under the best close since entry
const MOM_REVERSAL_BPS = -40n; // or when the 20-bar return turns this negative

const MAX_SLIPPAGE_BPS = 500; // wide enough that a fill's own impact never trips it
const MIN_NOTIONAL = 1000000n; // 1 USDC, in micro-USDC

// Close history, oldest first. Capped so memory stays flat over the window.
const closes: bigint[] = [];
let leg: '' | 'dip' | 'mom' = '';
let bestClose = 0n; // best close since a momentum entry, for the trailing stop

function bpsChange(now: bigint, then: bigint): bigint {
  return ((now - then) * BPS) / then;
}

function windowHigh(count: number): bigint {
  let high = closes[closes.length - 1];
  const start = closes.length - count;
  for (let i = start; i < closes.length; i++) {
    if (closes[i] > high) high = closes[i];
  }
  return high;
}

function onBatch(state: BarsState, batch: Batch) {
  if (state.warmingUp) return [];
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  closes.push(BigInt(bar.c));
  if (closes.length > 256) closes.splice(0, closes.length - 256);
  const close = BigInt(bar.c);

  const held = state.positions.get(SYMBOL);
  const qty = held === undefined ? 0n : held.qty;
  if (qty > 0n) {
    // Average fill price, in the bar's price scale. value (micro-USDC) =
    // qty * price / 10^(qty_scale + price_scale - quote_scale), so invert it.
    // (price_scale is 5 here, not 8: a close near 6.7e9 is ~$67,000.)
    const sym = state.symbols.get(SYMBOL);
    const quoteScale = state.hello.capital.quote_scale;
    const avgPrice =
      held === undefined || sym === undefined
        ? 0n
        : (held.cost * 10n ** BigInt(sym.qty_scale + sym.price_scale)) /
          (qty * 10n ** BigInt(quoteScale));
    const pnlBps = bpsChange(close, avgPrice);
    if (leg === 'dip') {
      if (pnlBps >= DIP_TAKE_BPS || pnlBps <= DIP_STOP_BPS) {
        leg = '';
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    // Momentum leg (and the fallback if the tag was ever lost): trail the
    // best close, and leave on a take-profit, a stop, a trail breach, or a
    // 20-bar reversal.
    if (close > bestClose) bestClose = close;
    const trailBps = bpsChange(close, bestClose);
    const ret20 =
      closes.length > MOM_LOOKBACK ? bpsChange(close, closes[closes.length - 1 - MOM_LOOKBACK]) : 0n;
    if (
      pnlBps >= MOM_TAKE_BPS ||
      pnlBps <= MOM_STOP_BPS ||
      trailBps <= MOM_TRAIL_BPS ||
      ret20 <= MOM_REVERSAL_BPS
    ) {
      leg = '';
      bestClose = 0n;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: nothing trades until 121 closes exist, so both legs always see a
  // full window. The dip leg fires first; it buys the whole cash balance.
  if (closes.length <= DIP_WINDOW) return [];
  {
    const high = windowHigh(DIP_WINDOW + 1);
    if (bpsChange(close, high) <= DIP_BPS && state.cash >= MIN_NOTIONAL) {
      leg = 'dip';
      bestClose = close;
      return [
        { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS },
      ];
    }
  }
  // Otherwise the momentum leg, half the cash, on a strong 20-bar push.
  if (closes.length > MOM_LOOKBACK) {
    const ret20 = bpsChange(close, closes[closes.length - 1 - MOM_LOOKBACK]);
    if (ret20 >= MOM_ENTRY_BPS) {
      const spend = (state.cash * MOM_SIZE_BPS) / BPS;
      if (spend >= MIN_NOTIONAL) {
        leg = 'mom';
        bestClose = close;
        return [
          { side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS },
        ];
      }
    }
  }
  return [];
}

await runBars({ onBatch });
