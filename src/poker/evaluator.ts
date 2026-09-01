import { Card, Rank } from './types';

// Hand category, higher is better.
export const enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

/** [category, tiebreak1, tiebreak2, ...] - compare lexicographically, higher wins. */
export type HandScore = number[];

function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];
  function backtrack(start: number) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return result;
}

function straightHighFrom(ranksDesc: Rank[]): number | null {
  // ranksDesc: unique ranks, sorted descending
  const candidates: number[] = ranksDesc.slice();
  if (ranksDesc.includes(14)) candidates.push(1); // treat ace as 1 for wheel (A-5) check
  const uniqueSorted = Array.from(new Set(candidates)).sort((a, b) => b - a);
  for (let i = 0; i <= uniqueSorted.length - 5; i++) {
    let consecutive = true;
    for (let j = 0; j < 4; j++) {
      if (uniqueSorted[i + j] - uniqueSorted[i + j + 1] !== 1) {
        consecutive = false;
        break;
      }
    }
    if (consecutive) return uniqueSorted[i];
  }
  return null;
}

/** Evaluate exactly 5 cards. Returns a comparable score array. */
export function evaluate5(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const uniqueRanksDesc = Array.from(new Set(ranks)).sort((a, b) => b - a) as Rank[];

  const straightHigh = uniqueRanksDesc.length === 5 ? straightHighFrom(uniqueRanksDesc) : null;

  if (isFlush && straightHigh !== null) {
    return [HandCategory.StraightFlush, straightHigh];
  }

  // group by count then by rank desc: [ [count, rank], ... ]
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

  if (groups[0].count === 4) {
    const kicker = groups.find((g) => g.count === 1)!.rank;
    return [HandCategory.Quads, groups[0].rank, kicker];
  }
  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return [HandCategory.FullHouse, groups[0].rank, groups[1].rank];
  }
  if (isFlush) {
    return [HandCategory.Flush, ...ranks];
  }
  if (straightHigh !== null) {
    return [HandCategory.Straight, straightHigh];
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.rank);
    return [HandCategory.Trips, groups[0].rank, ...kickers];
  }
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairRanks = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    const kicker = groups.find((g) => g.count === 1)!.rank;
    return [HandCategory.TwoPair, ...pairRanks, kicker];
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.rank);
    return [HandCategory.Pair, groups[0].rank, ...kickers];
  }
  return [HandCategory.HighCard, ...ranks];
}

export function compareScores(a: HandScore, b: HandScore): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Evaluate the best 5-card hand out of 5-7 cards. */
export function evaluateBest(cards: Card[]): HandScore {
  if (cards.length === 5) return evaluate5(cards);
  const combos = combinations(cards, 5);
  let best: HandScore = [-1];
  for (const combo of combos) {
    const score = evaluate5(combo);
    if (compareScores(score, best) > 0) best = score;
  }
  return best;
}
