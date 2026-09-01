import { Card } from '../poker/types';
import { cardKey } from '../poker/cards';
import { expandCombos, getAllHandTypes, HandType } from '../poker/handRanking';
import { CfrTrainer, PublicNode } from './cfr';
import { bucketFromStrength, preflopBucket, postflopStrength } from './handStrength';
import { buildTree, NodeMeta, sampleWorld } from './tree';
import { HoldemWorld, SpotConfig, Street } from './types';

export interface SolveResult {
  root: PublicNode<HoldemWorld>;
  meta: Map<number, NodeMeta>;
  trainer: CfrTrainer<HoldemWorld>;
  config: SpotConfig;
  iterationsRun: number;
}

/**
 * Runs CFR training in small chunks (yielding to the JS event loop between
 * chunks) so the UI thread stays responsive and can show progress. This is
 * the whole solve: build the abstracted tree once, then repeatedly sample a
 * concrete deal and run one chance-sampled CFR pass over it.
 */
export async function solveSpot(
  config: SpotConfig,
  iterations: number,
  onProgress?: (done: number, total: number) => void,
  chunkSize = 100
): Promise<SolveResult> {
  const { root, meta } = buildTree(config);
  const trainer = new CfrTrainer<HoldemWorld>(config.numPlayers);

  let done = 0;
  while (done < iterations) {
    const batch = Math.min(chunkSize, iterations - done);
    for (let i = 0; i < batch; i++) {
      const world = sampleWorld(config, Math.random);
      trainer.runIteration(root, world);
    }
    done += batch;
    onProgress?.(done, iterations);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { root, meta, trainer, config, iterationsRun: done };
}

export interface ActionFrequencies {
  actions: string[];
  frequencies: number[];
}

function boardLengthFor(street: Street): number {
  return street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
}

/** Strategy for one exact 2-card hand at a given decision node, given the board known at that node's street. */
export function strategyForHand(
  result: SolveResult,
  node: PublicNode<HoldemWorld>,
  hole: [Card, Card],
  street: Street,
  board: Card[]
): ActionFrequencies | null {
  if (node.type !== 'decision') return null;
  const bucket =
    street === 'preflop'
      ? preflopBucket(hole[0].rank, hole[1].rank, hole[0].suit === hole[1].suit, result.config.numBuckets)
      : bucketFromStrength(
          postflopStrength(hole, board.slice(0, boardLengthFor(street)), Math.random, result.config.postflopTrials),
          result.config.numBuckets
        );
  const key = `${node.id}:${bucket}`;
  const avg = result.trainer.averageStrategy(key);
  if (!avg) return null;
  return { actions: node.actions, frequencies: avg };
}

/** Strategy for each hand-strength bucket at a node, for streets beyond the spot's known board. */
export function bucketStrategiesForNode(
  result: SolveResult,
  node: PublicNode<HoldemWorld>
): { bucket: number; strategy: ActionFrequencies | null }[] {
  if (node.type !== 'decision') return [];
  const bars: { bucket: number; strategy: ActionFrequencies | null }[] = [];
  for (let bucket = 0; bucket < result.config.numBuckets; bucket++) {
    const avg = result.trainer.averageStrategy(`${node.id}:${bucket}`);
    bars.push({ bucket, strategy: avg ? { actions: node.actions, frequencies: avg } : null });
  }
  return bars;
}

export interface RangeGridEntry {
  handType: HandType;
  strategy: ActionFrequencies | null;
}

/**
 * Strategy for every one of the 169 starting-hand types at a given node,
 * for the range-grid display. Only meaningful when `board` is the single
 * real board for that node's street (i.e. the node's street is the spot's
 * configured start street) — see solveSpot's caveat on later streets.
 */
export function rangeGridForNode(
  result: SolveResult,
  node: PublicNode<HoldemWorld>,
  street: Street,
  board: Card[]
): RangeGridEntry[] {
  if (node.type !== 'decision') return [];
  const dead = new Set(board.map(cardKey));
  return getAllHandTypes().map((handType) => {
    if (street === 'preflop') {
      const bucket = preflopBucket(handType.high, handType.low, handType.suited, result.config.numBuckets);
      const avg = result.trainer.averageStrategy(`${node.id}:${bucket}`);
      return { handType, strategy: avg ? { actions: node.actions, frequencies: avg } : null };
    }
    const combo = expandCombos(handType).find(([a, b]) => !dead.has(cardKey(a)) && !dead.has(cardKey(b)));
    if (!combo) return { handType, strategy: null };
    const strength = postflopStrength(combo, board.slice(0, boardLengthFor(street)), Math.random, result.config.postflopTrials);
    const bucket = bucketFromStrength(strength, result.config.numBuckets);
    const avg = result.trainer.averageStrategy(`${node.id}:${bucket}`);
    return { handType, strategy: avg ? { actions: node.actions, frequencies: avg } : null };
  });
}
