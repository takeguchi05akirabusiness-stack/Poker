import { Card } from '../poker/types';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface SizingConfig {
  /** Bet/raise sizes as a fraction of the pot (after any call), e.g. [0.5, 1] = half-pot and pot-size. */
  potFractions: number[];
  /** Maximum number of bets/raises allowed in this street (abstraction cap to bound tree size). */
  raiseCap: number;
}

export type BetAbstraction = Record<Street, SizingConfig>;

export interface SpotConfig {
  numPlayers: number;
  /** Fixed turn order (player indices 0..numPlayers-1), reused for every street. */
  actingOrder: number[];
  /** Starting effective stack (BB) for every player at the start of this subgame. */
  effectiveStackBB: number;
  /** Chips already in the middle before any action modeled by the solver. */
  potBB: number;
  /** The street the solve starts from. Board must already contain that street's cards. */
  startStreet: Street;
  /** Known board cards so far (0 for preflop, 3 flop, 4 turn, 5 river). */
  board: Card[];
  /** Per-player list of concrete hole-card combos consistent with their estimated range. */
  ranges: [Card, Card][][];
  betAbstraction: BetAbstraction;
  /** Number of hand-strength buckets per street (card abstraction granularity). */
  numBuckets: number;
  /** Monte Carlo trials used to estimate postflop hand-strength buckets. */
  postflopTrials: number;
}

export interface HoldemWorld {
  holeCards: [Card, Card][];
  board: Card[];
  bucketCache: Map<string, number>;
  /** Memoized best-5-of-7 showdown score per player, keyed by player index. */
  showdownScoreCache: Map<number, number[]>;
  rng: () => number;
}

export const DEFAULT_SIZING: SizingConfig = { potFractions: [0.75], raiseCap: 1 };

export function defaultBetAbstraction(): BetAbstraction {
  return {
    preflop: { potFractions: [1], raiseCap: 1 },
    flop: { potFractions: [0.75], raiseCap: 1 },
    turn: { potFractions: [0.75], raiseCap: 1 },
    river: { potFractions: [0.75], raiseCap: 1 },
  };
}

/** A wider (slower to solve, more realistic) sizing preset. */
export function wideBetAbstraction(): BetAbstraction {
  return {
    preflop: { potFractions: [1], raiseCap: 2 },
    flop: { potFractions: [0.5, 1], raiseCap: 2 },
    turn: { potFractions: [0.5, 1], raiseCap: 2 },
    river: { potFractions: [0.5, 1], raiseCap: 2 },
  };
}
