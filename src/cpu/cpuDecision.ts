import { ActionRecord, ActionType, Card } from '../poker/types';
import { cardKey } from '../poker/cards';
import { positionsForTableSize } from '../poker/positions';
import { combosForBand, estimateRangeBand } from '../poker/ranges';
import { solveSpot, strategyForHand } from '../solver/solve';
import { defaultBetAbstraction, SpotConfig, wideBetAbstraction } from '../solver/types';
import { HandState, LiveAction, LiveActionType, toCallFor } from './gameEngine';

export interface CpuStrength {
  label: string;
  numBuckets: number;
  iterations: number;
  sizingPreset: 'simple' | 'wide';
}

export const CPU_STRENGTHS: Record<'weak' | 'normal' | 'strong', CpuStrength> = {
  weak: { label: '弱い', numBuckets: 3, iterations: 250, sizingPreset: 'simple' },
  normal: { label: '普通', numBuckets: 5, iterations: 600, sizingPreset: 'simple' },
  strong: { label: '強い', numBuckets: 6, iterations: 1200, sizingPreset: 'wide' },
};

function liveTypeToRangeActionType(type: LiveActionType): ActionType {
  switch (type) {
    case 'fold':
      return 'fold';
    case 'check':
      return 'check';
    case 'call':
      return 'call';
    case 'bet':
    case 'raise':
    case 'allin':
      return 'raise';
  }
}

/** Estimate the human's current-hand range from their real action history so far, reusing the 4-1 heuristic. */
function estimateHumanRangeCombos(hand: HandState): [Card, Card][] {
  const humanPosition = hand.buttonIsHuman ? positionsForTableSize(2)[0] : positionsForTableSize(2)[1];
  const records: ActionRecord[] = hand.log
    .filter((e) => e.player === 0)
    .map((e) => ({ street: e.street, type: liveTypeToRangeActionType(e.type) }));
  // estimateRangeBand's empty-history default is the position's normal OPENING range (a prior
  // for "if they end up raising here"), which is far too narrow as a prior for "hasn't acted at
  // all yet" (e.g. the very first decision of the hand, before the human — who might be BB and
  // hasn't had a chance to do anything — has shown any strength). Use a full-range prior instead
  // whenever there's no real action to read anything into.
  const band = records.length > 0 ? estimateRangeBand(humanPosition, records) : { top: 0, bottom: 100 };
  const dead = new Set([...hand.holeCards[1], ...hand.board].map(cardKey));
  const combos = combosForBand(band).filter(([a, b]) => !dead.has(cardKey(a)) && !dead.has(cardKey(b)));
  return combos.length > 0 ? combos : combosForBand({ top: 0, bottom: 100 }).filter(([a, b]) => !dead.has(cardKey(a)) && !dead.has(cardKey(b)));
}

function labelToLiveType(label: string): LiveActionType {
  if (label === 'fold') return 'fold';
  if (label === 'check') return 'check';
  if (label === 'call') return 'call';
  if (label === 'allin') return 'allin';
  if (label.startsWith('bet')) return 'bet';
  return 'raise';
}

function sampleIndex(frequencies: number[], rng: () => number): number {
  const r = rng();
  let cumulative = 0;
  for (let i = 0; i < frequencies.length; i++) {
    cumulative += frequencies[i];
    if (r <= cumulative) return i;
  }
  return frequencies.length - 1;
}

export interface CpuDecisionResult {
  action: LiveAction;
  strategy: { actions: string[]; frequencies: number[] };
}

/**
 * Decides the CPU's action at its current real decision point by building a
 * fresh SpotConfig from the exact live state (continual re-solving, in the
 * spirit of the subgame-solving technique used by strong poker AIs) and
 * sampling from the resulting equilibrium-approximating mixed strategy.
 * The CPU's own range is pinned to its real hole cards; the human's range is
 * estimated from their actual actions this hand via the 4-1 heuristic.
 */
export async function decideCpuAction(
  hand: HandState,
  strength: CpuStrength,
  rng: () => number = Math.random
): Promise<CpuDecisionResult> {
  const cpuSeat = 1;
  const humanSeat = 0;
  const betAbstraction = strength.sizingPreset === 'simple' ? defaultBetAbstraction() : wideBetAbstraction();

  const stacksAtStreetStart: [number, number] = [
    hand.stacks[humanSeat] + hand.committedThisStreet[humanSeat],
    hand.stacks[cpuSeat] + hand.committedThisStreet[cpuSeat],
  ];

  const config: SpotConfig = {
    numPlayers: 2,
    actingOrder: [cpuSeat, humanSeat],
    // Only a fallback for entries stacksBB doesn't cover; stacksBB below supplies both, so this is unused.
    effectiveStackBB: Math.max(stacksAtStreetStart[0], stacksAtStreetStart[1]),
    stacksBB: stacksAtStreetStart,
    initialCommitted: [hand.committedThisStreet[humanSeat], hand.committedThisStreet[cpuSeat]],
    initialNumRaises: hand.numRaisesThisStreet,
    potBB: hand.potBB,
    startStreet: hand.street,
    board: hand.board,
    ranges: [estimateHumanRangeCombos(hand), [hand.holeCards[cpuSeat]]],
    betAbstraction,
    numBuckets: strength.numBuckets,
    postflopTrials: 10,
  };

  const result = await solveSpot(config, strength.iterations);
  const root = result.root;
  if (root.type !== 'decision') {
    // Shouldn't happen (we only call this when the CPU actually has a decision), but fold safely.
    return { action: { type: toCallFor(hand, cpuSeat) > 0 ? 'fold' : 'check' }, strategy: { actions: [], frequencies: [] } };
  }

  const strategy = strategyForHand(result, root, hand.holeCards[cpuSeat], hand.street, hand.board) ?? {
    actions: root.actions,
    frequencies: root.actions.map(() => 1 / root.actions.length),
  };

  const meta = result.meta.get(root.id)!;
  const chosen = sampleIndex(strategy.frequencies, rng);
  const label = strategy.actions[chosen];
  const type = labelToLiveType(label);

  if (type === 'fold' || type === 'check' || type === 'call') {
    return { action: { type }, strategy };
  }
  const increment = meta.amounts[chosen];
  const totalCommitted = hand.committedThisStreet[cpuSeat] + increment;
  return { action: { type, amount: totalCommitted }, strategy };
}
