import { Card } from '../poker/types';
import { cardKey, fullDeck } from '../poker/cards';
import { compareScores, evaluateBest } from '../poker/evaluator';
import { percentileOfHand } from '../poker/handRanking';

/**
 * Card abstraction for the solver: each player's concrete hand is mapped to
 * one of a small number of "buckets" per street so that the CFR engine only
 * has to learn a strategy per (decision node x bucket) instead of per exact
 * hand. This is the standard way to make postflop CFR tractable; see e.g.
 * Zinkevich et al. and the "abstraction" literature. Bucketing here is
 * plain equity-based (not potential-aware) — a deliberate MVP simplification.
 */

/** Preflop bucket: exact, based on the 169-hand percentile ranking (0=best). */
export function preflopBucket(r1: Card['rank'], r2: Card['rank'], suited: boolean, numBuckets: number): number {
  const percentile = percentileOfHand(r1, r2, suited); // 0 (best) - 100 (worst)
  const bucket = Math.floor((percentile / 100) * numBuckets);
  return Math.max(0, Math.min(numBuckets - 1, bucket));
}

/**
 * Postflop bucket: approximate hand strength via a small Monte Carlo
 * rollout against a single random opponent hand drawn from the remaining
 * deck (win=1, tie=0.5, loss=0), then discretize into equal-width buckets.
 * This is intentionally cheap (a handful of hand evaluations) because it
 * runs many times per CFR iteration.
 */
export function postflopStrength(
  hole: [Card, Card],
  board: Card[],
  rng: () => number,
  trials = 25
): number {
  const dead = new Set<string>([...hole, ...board].map(cardKey));
  const deck = fullDeck().filter((c) => !dead.has(cardKey(c)));
  let total = 0;
  for (let t = 0; t < trials; t++) {
    const pool = deck.slice();
    const oppCards: Card[] = [];
    for (let i = 0; i < 2; i++) {
      const idx = Math.floor(rng() * pool.length);
      oppCards.push(pool[idx]);
      pool.splice(idx, 1);
    }
    const heroScore = evaluateBest([...hole, ...board]);
    const oppScore = evaluateBest([...oppCards, ...board]);
    const cmp = compareScores(heroScore, oppScore);
    total += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
  }
  return total / trials;
}

export function bucketFromStrength(strength: number, numBuckets: number): number {
  const bucket = Math.floor(strength * numBuckets);
  return Math.max(0, Math.min(numBuckets - 1, bucket));
}
