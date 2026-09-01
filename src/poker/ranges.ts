import { ActionRecord, Card } from './types';
import { defaultOpenPercent } from './positions';
import { expandCombos, handTypesInBand } from './handRanking';

export interface Band {
  top: number; // 0 = strongest possible hand (AA)
  bottom: number; // 100 = weakest possible hand (72o)
}

const MIN_WIDTH = 2;

function clampBand(b: Band): Band {
  let { top, bottom } = b;
  top = Math.max(0, Math.min(100, top));
  bottom = Math.max(0, Math.min(100, bottom));
  if (bottom - top < MIN_WIDTH) bottom = Math.min(100, top + MIN_WIDTH);
  return { top, bottom };
}

/**
 * Simple heuristic range estimator: starts from the position's default
 * opening range and progressively narrows/widens as actions accumulate.
 * This is intentionally approximate (see spec section 4-1) — a static
 * range-chart engine is planned as a future refinement.
 */
export function estimateRangeBand(position: string, actions: ActionRecord[]): Band {
  const base = defaultOpenPercent(position);
  let band: Band = { top: 0, bottom: base };
  let facedAggressionPreflop = false;

  for (const action of actions) {
    const isPreflop = action.street === 'preflop';
    switch (action.type) {
      case 'raise':
        if (isPreflop && !facedAggressionPreflop) {
          // Opening raise: roughly their normal opening range.
          band = { top: 0, bottom: base };
        } else {
          // Raising into others (postflop bet/raise, or preflop after limps): tighten hard.
          band = { top: band.top, bottom: band.top + (band.bottom - band.top) * 0.55 };
        }
        facedAggressionPreflop = facedAggressionPreflop || isPreflop;
        break;
      case 'reraise':
        band = { top: band.top, bottom: band.top + (band.bottom - band.top) * 0.35 };
        facedAggressionPreflop = true;
        break;
      case 'bet':
        band = { top: band.top, bottom: band.top + (band.bottom - band.top) * 0.55 };
        break;
      case 'call':
        if (isPreflop) {
          if (facedAggressionPreflop) {
            // Cold call of a raise: exclude the very top (would reraise) and very bottom (would fold).
            band = {
              top: Math.min(100, band.top + 3),
              bottom: band.top + (band.bottom - band.top) * 0.9,
            };
          } else {
            // Limp: wider, weaker range than an opening raise.
            band = { top: base * 0.3, bottom: Math.min(100, base * 2.2) };
          }
        } else {
          band = { top: band.top, bottom: band.top + (band.bottom - band.top) * 0.8 };
        }
        break;
      case 'limp':
        band = { top: base * 0.3, bottom: Math.min(100, base * 2.2) };
        break;
      case 'check':
        band = { top: Math.max(0, band.top - 1), bottom: Math.min(100, band.bottom * 1.15) };
        break;
      case 'fold':
        // Irrelevant: player is removed from simulation elsewhere.
        break;
    }
    band = clampBand(band);
  }

  return clampBand(band);
}

/** Concrete 2-card combos consistent with a range band, before removing dead cards. */
export function combosForBand(band: Band): [Card, Card][] {
  const types = handTypesInBand(band.top, band.bottom);
  const combos: [Card, Card][] = [];
  for (const t of types) {
    combos.push(...expandCombos(t));
  }
  return combos;
}
