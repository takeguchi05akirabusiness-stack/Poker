import { Card, EquityResult } from './types';
import { cardKey, fullDeck } from './cards';
import { compareScores, evaluateBest } from './evaluator';

export interface OpponentInput {
  /** Concrete 2-card combos consistent with this opponent's estimated range. */
  combos: [Card, Card][];
}

const BASE_TRIAL_BUDGET = 24000;
const MIN_TRIALS = 1500;
const MAX_TRIALS = 30000;

export function trialsForOpponentCount(numOpponents: number): number {
  const n = Math.max(1, numOpponents);
  return Math.round(Math.max(MIN_TRIALS, Math.min(MAX_TRIALS, BASE_TRIAL_BUDGET / n)));
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Monte Carlo equity simulation: hero's 2 cards vs each opponent's estimated
 * range, given the known community cards so far. Folded players should not
 * be included in `opponents`.
 */
export function simulateEquity(
  hero: [Card, Card],
  board: Card[],
  opponents: OpponentInput[],
  options: { trials?: number; rng?: () => number } = {}
): EquityResult {
  const rng = options.rng ?? Math.random;
  const trials = options.trials ?? trialsForOpponentCount(opponents.length);

  if (opponents.length === 0) {
    return { winPercent: 100, tiePercent: 0, lossPercent: 0, trials: 0 };
  }

  const deck = fullDeck();
  const knownDead = new Set<string>([...hero, ...board].map(cardKey));
  const deckMinusKnown = deck.filter((c) => !knownDead.has(cardKey(c)));

  let equitySum = 0;
  let winCount = 0;
  let tieCount = 0;
  let validTrials = 0;

  for (let t = 0; t < trials; t++) {
    const used = new Set<string>(knownDead);
    const oppHands: [Card, Card][] = [];
    let dealFailed = false;

    for (const opp of opponents) {
      let candidates = opp.combos.filter(
        ([a, b]) => !used.has(cardKey(a)) && !used.has(cardKey(b))
      );
      if (candidates.length === 0) {
        // Range exhausted by card removal; fall back to any two remaining cards.
        const remaining = deckMinusKnown.filter((c) => !used.has(cardKey(c)));
        if (remaining.length < 2) {
          dealFailed = true;
          break;
        }
        const a = pickRandom(remaining, rng);
        const remaining2 = remaining.filter((c) => cardKey(c) !== cardKey(a));
        const b = pickRandom(remaining2, rng);
        candidates = [[a, b]];
      }
      const hand = pickRandom(candidates, rng);
      used.add(cardKey(hand[0]));
      used.add(cardKey(hand[1]));
      oppHands.push(hand);
    }

    if (dealFailed) continue;

    const remainingDeck = deckMinusKnown.filter((c) => !used.has(cardKey(c)));
    const cardsNeeded = 5 - board.length;
    if (remainingDeck.length < cardsNeeded) continue;

    const drawn: Card[] = [];
    const pool = remainingDeck.slice();
    for (let i = 0; i < cardsNeeded; i++) {
      const idx = Math.floor(rng() * pool.length);
      drawn.push(pool[idx]);
      pool.splice(idx, 1);
    }
    const fullBoard = [...board, ...drawn];

    const heroScore = evaluateBest([...hero, ...fullBoard]);
    const oppScores = oppHands.map((h) => evaluateBest([...h, ...fullBoard]));

    let bestScore = heroScore;
    for (const s of oppScores) {
      if (compareScores(s, bestScore) > 0) bestScore = s;
    }
    let winners = compareScores(heroScore, bestScore) === 0 ? 1 : 0;
    for (const s of oppScores) {
      if (compareScores(s, bestScore) === 0) winners++;
    }

    validTrials++;
    if (compareScores(heroScore, bestScore) === 0) {
      equitySum += 1 / winners;
      if (winners === 1) winCount++;
      else tieCount++;
    }
  }

  if (validTrials === 0) {
    return { winPercent: 0, tiePercent: 0, lossPercent: 100, trials: 0 };
  }

  const winPercent = (winCount / validTrials) * 100;
  const tiePercent = (tieCount / validTrials) * 100;
  const lossPercent = 100 - winPercent - tiePercent;

  return { winPercent, tiePercent, lossPercent, trials: validTrials };
}
