import { Card, Rank, Suit } from './types';
import { RANKS, SUITS } from './cards';

export interface HandType {
  high: Rank;
  low: Rank;
  suited: boolean;
  isPair: boolean;
  label: string; // e.g. "AKs", "AKo", "77"
}

function chenPoints(high: Rank, low: Rank, suited: boolean): number {
  const pointValue: Partial<Record<Rank, number>> = { 14: 10, 13: 8, 12: 7, 11: 6, 10: 5 };
  const basePoints = (r: Rank) => pointValue[r] ?? r / 2;

  if (high === low) {
    return Math.max(basePoints(high) * 2, 5);
  }

  let score = basePoints(high);
  if (suited) score += 2;

  const gap = high - low - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;

  // Connectivity bonus: both cards below Q and gap small enough to make a straight easily.
  if (gap <= 1 && high < 12) score += 1;

  return score;
}

function buildHandTypes(): HandType[] {
  const types: HandType[] = [];
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i; j < RANKS.length; j++) {
      const high = RANKS[i];
      const low = RANKS[j];
      if (high === low) {
        types.push({ high, low, suited: false, isPair: true, label: `${rankChar(high)}${rankChar(high)}` });
      } else {
        types.push({ high, low, suited: true, isPair: false, label: `${rankChar(high)}${rankChar(low)}s` });
        types.push({ high, low, suited: false, isPair: false, label: `${rankChar(high)}${rankChar(low)}o` });
      }
    }
  }
  return types;
}

function rankChar(r: Rank): string {
  const map: Record<number, string> = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
  return map[r] ?? String(r);
}

interface RankedHandType extends HandType {
  score: number;
  percentile: number; // 0 = best (AA), 100 = worst (72o)
}

const ALL_HAND_TYPES: RankedHandType[] = (() => {
  const types = buildHandTypes().map((t) => ({ ...t, score: chenPoints(t.high, t.low, t.suited), percentile: 0 }));
  types.sort((a, b) => b.score - a.score);
  const n = types.length;
  types.forEach((t, idx) => {
    t.percentile = (idx / (n - 1)) * 100;
  });
  return types;
})();

export function getAllHandTypes(): RankedHandType[] {
  return ALL_HAND_TYPES;
}

/** Hand types whose percentile falls within [topPercent, bottomPercent] (0 = strongest). */
export function handTypesInBand(topPercent: number, bottomPercent: number): RankedHandType[] {
  const lo = Math.max(0, Math.min(topPercent, bottomPercent));
  const hi = Math.min(100, Math.max(topPercent, bottomPercent));
  return ALL_HAND_TYPES.filter((t) => t.percentile >= lo && t.percentile <= hi);
}

/** Expand a hand type into concrete 2-card combos. */
export function expandCombos(type: HandType): [Card, Card][] {
  const combos: [Card, Card][] = [];
  if (type.isPair) {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([
          { rank: type.high, suit: SUITS[i] },
          { rank: type.high, suit: SUITS[j] },
        ]);
      }
    }
  } else if (type.suited) {
    for (const s of SUITS) {
      combos.push([
        { rank: type.high, suit: s },
        { rank: type.low, suit: s },
      ]);
    }
  } else {
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (s1 === s2) continue;
        combos.push([
          { rank: type.high, suit: s1 },
          { rank: type.low, suit: s2 },
        ]);
      }
    }
  }
  return combos;
}

/** Percentile (0-100, 0=best) of a specific two-card hand. */
export function percentileOfHand(r1: Rank, r2: Rank, suited: boolean): number {
  const high = Math.max(r1, r2) as Rank;
  const low = Math.min(r1, r2) as Rank;
  const isPair = high === low;
  const match = ALL_HAND_TYPES.find(
    (t) => t.high === high && t.low === low && (isPair || t.suited === suited)
  );
  return match ? match.percentile : 100;
}
