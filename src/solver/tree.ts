import { Card } from '../poker/types';
import { cardKey, fullDeck } from '../poker/cards';
import { compareScores, evaluateBest } from '../poker/evaluator';
import { PublicNode } from './cfr';
import { bucketFromStrength, preflopBucket, postflopStrength } from './handStrength';
import { HoldemWorld, SpotConfig, Street, STREET_ORDER } from './types';

export interface NodeMeta {
  id: number;
  player: number;
  street: Street;
  actions: string[];
  historyLabel: string;
}

interface BuildState {
  activePlayers: number[];
  stacks: number[];
  committedThisStreet: number[];
  totalCommitted: number[];
  street: Street;
  playersToAct: Set<number>;
  numRaisesThisStreet: number;
  afterPlayer: number;
  historyLabel: string;
}

function nextToAct(actingOrder: number[], afterPlayer: number, playersToAct: Set<number>): number | null {
  const n = actingOrder.length;
  const startIdx = afterPlayer === -1 ? 0 : (actingOrder.indexOf(afterPlayer) + 1) % n;
  for (let k = 0; k < n; k++) {
    const idx = (startIdx + k) % n;
    const p = actingOrder[idx];
    if (playersToAct.has(p)) return p;
  }
  return null;
}

function boardLengthFor(street: Street): number {
  return street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
}

/**
 * A player's best 5-of-7 showdown score depends only on their hole cards
 * and the final board, both fixed for the whole iteration/world — so it is
 * identical no matter which terminal node it's evaluated from. Memoizing it
 * here avoids re-running the (relatively expensive) 7-card evaluator at
 * every one of the many showdown terminals visited per CFR iteration.
 */
function getShowdownScore(world: HoldemWorld, player: number) {
  const cached = world.showdownScoreCache.get(player);
  if (cached) return cached;
  const score = evaluateBest([...world.holeCards[player], ...world.board]);
  world.showdownScoreCache.set(player, score);
  return score;
}

function getBucket(world: HoldemWorld, player: number, street: Street, config: SpotConfig): number {
  const cacheKey = `${player}:${street}`;
  const cached = world.bucketCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const hole = world.holeCards[player];
  let bucket: number;
  if (street === 'preflop') {
    bucket = preflopBucket(hole[0].rank, hole[1].rank, hole[0].suit === hole[1].suit, config.numBuckets);
  } else {
    const board = world.board.slice(0, boardLengthFor(street));
    const strength = postflopStrength(hole, board, world.rng, config.postflopTrials);
    bucket = bucketFromStrength(strength, config.numBuckets);
  }
  world.bucketCache.set(cacheKey, bucket);
  return bucket;
}

export function buildTree(config: SpotConfig): { root: PublicNode<HoldemWorld>; meta: Map<number, NodeMeta> } {
  const meta = new Map<number, NodeMeta>();
  let nextId = 0;

  function terminalFoldWin(winner: number, totalCommitted: number[]): PublicNode<HoldemWorld> {
    const N = config.numPlayers;
    const pot = config.potBB + totalCommitted.reduce((a, b) => a + b, 0);
    const payoff = new Array(N).fill(0).map((_, p) => (p === winner ? pot - totalCommitted[p] : -totalCommitted[p]));
    return { type: 'terminal', payoff: () => payoff };
  }

  function terminalShowdown(activePlayers: number[], totalCommitted: number[]): PublicNode<HoldemWorld> {
    const N = config.numPlayers;
    const pot = config.potBB + totalCommitted.reduce((a, b) => a + b, 0);
    return {
      type: 'terminal',
      payoff: (world: HoldemWorld) => {
        const scores = activePlayers.map((p) => getShowdownScore(world, p));
        let best = scores[0];
        for (const s of scores) if (compareScores(s, best) > 0) best = s;
        const winners = activePlayers.filter((_, i) => compareScores(scores[i], best) === 0);
        const share = pot / winners.length;
        const payoff = new Array(N).fill(0);
        for (let p = 0; p < N; p++) payoff[p] = -totalCommitted[p];
        for (const w of winners) payoff[w] += share;
        return payoff;
      },
    };
  }

  function advanceStreet(state: BuildState): PublicNode<HoldemWorld> {
    let street = state.street;
    while (true) {
      if (street === 'river') {
        return terminalShowdown(state.activePlayers, state.totalCommitted);
      }
      street = STREET_ORDER[STREET_ORDER.indexOf(street) + 1];
      const playersToAct = new Set(state.activePlayers.filter((p) => state.stacks[p] > 0));
      if (playersToAct.size >= 2) {
        return buildRound({
          ...state,
          street,
          committedThisStreet: new Array(config.numPlayers).fill(0),
          playersToAct,
          numRaisesThisStreet: 0,
          afterPlayer: -1,
        });
      }
      // Everyone remaining is all-in (or nobody can act): run the street out with no decisions.
    }
  }

  function buildRound(state: BuildState): PublicNode<HoldemWorld> {
    const p = nextToAct(config.actingOrder, state.afterPlayer, state.playersToAct);
    if (p === null) return advanceStreet(state);

    const maxCommitted = Math.max(...state.activePlayers.map((pl) => state.committedThisStreet[pl]));
    const toCall = maxCommitted - state.committedThisStreet[p];
    const potNow = config.potBB + state.totalCommitted.reduce((a, b) => a + b, 0);
    const sizing = config.betAbstraction[state.street];
    const stack = state.stacks[p];

    type Option = { label: string; amount: number; kind: 'fold' | 'passive' | 'aggressive' };
    const options: Option[] = [];

    if (toCall === 0) {
      options.push({ label: 'check', amount: 0, kind: 'passive' });
      if (state.numRaisesThisStreet < sizing.raiseCap && stack > 0) {
        for (const f of sizing.potFractions) {
          const amount = Math.min(Math.round(f * potNow), stack);
          if (amount > 0) options.push({ label: `bet${Math.round(f * 100)}`, amount, kind: 'aggressive' });
        }
        options.push({ label: 'allin', amount: stack, kind: 'aggressive' });
      }
    } else {
      options.push({ label: 'fold', amount: 0, kind: 'fold' });
      const callAmount = Math.min(toCall, stack);
      options.push({ label: 'call', amount: callAmount, kind: 'passive' });
      if (state.numRaisesThisStreet < sizing.raiseCap && stack > callAmount) {
        for (const f of sizing.potFractions) {
          const potAfterCall = potNow + callAmount;
          const totalPut = Math.min(callAmount + Math.round(f * potAfterCall), stack);
          if (totalPut > callAmount) options.push({ label: `raise${Math.round(f * 100)}`, amount: totalPut, kind: 'aggressive' });
        }
        if (stack > callAmount) options.push({ label: 'allin', amount: stack, kind: 'aggressive' });
      }
    }

    const seen = new Set<string>();
    const dedup: Option[] = [];
    for (const o of options) {
      const key = `${o.kind}:${o.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(o);
    }

    const id = nextId++;
    const children: PublicNode<HoldemWorld>[] = [];
    const actionLabels: string[] = [];

    for (const o of dedup) {
      const newPlayersToAct = new Set(state.playersToAct);
      newPlayersToAct.delete(p);

      if (o.kind === 'fold') {
        const newActive = state.activePlayers.filter((x) => x !== p);
        if (newActive.length === 1) {
          children.push(terminalFoldWin(newActive[0], state.totalCommitted));
        } else {
          children.push(
            buildRound({
              ...state,
              activePlayers: newActive,
              playersToAct: newPlayersToAct,
              afterPlayer: p,
              historyLabel: `${state.historyLabel}${state.historyLabel ? ' ' : ''}P${p}:fold`,
            })
          );
        }
        actionLabels.push(o.label);
        continue;
      }

      const newCommitted = state.committedThisStreet.slice();
      const newTotal = state.totalCommitted.slice();
      const newStacks = state.stacks.slice();
      newCommitted[p] += o.amount;
      newTotal[p] += o.amount;
      newStacks[p] -= o.amount;

      let nextPlayersToAct = newPlayersToAct;
      let newNumRaises = state.numRaisesThisStreet;
      if (o.kind === 'aggressive') {
        newNumRaises += 1;
        nextPlayersToAct = new Set(state.activePlayers.filter((x) => x !== p && newStacks[x] > 0));
      }

      children.push(
        buildRound({
          ...state,
          committedThisStreet: newCommitted,
          totalCommitted: newTotal,
          stacks: newStacks,
          playersToAct: nextPlayersToAct,
          numRaisesThisStreet: newNumRaises,
          afterPlayer: p,
          historyLabel: `${state.historyLabel}${state.historyLabel ? ' ' : ''}P${p}:${o.label}`,
        })
      );
      actionLabels.push(o.label);
    }

    meta.set(id, { id, player: p, street: state.street, actions: actionLabels, historyLabel: state.historyLabel });

    return {
      type: 'decision',
      id,
      player: p,
      actions: actionLabels,
      infoSet: (world) => `${id}:${getBucket(world, p, state.street, config)}`,
      children,
    };
  }

  const N = config.numPlayers;
  const initialState: BuildState = {
    activePlayers: Array.from({ length: N }, (_, i) => i),
    stacks: new Array(N).fill(config.effectiveStackBB),
    committedThisStreet: new Array(N).fill(0),
    totalCommitted: new Array(N).fill(0),
    street: config.startStreet,
    playersToAct: new Set(Array.from({ length: N }, (_, i) => i)),
    numRaisesThisStreet: 0,
    afterPlayer: -1,
    historyLabel: '',
  };

  const root = buildRound(initialState);
  return { root, meta };
}

export function sampleWorld(config: SpotConfig, rng: () => number): HoldemWorld {
  const used = new Set<string>(config.board.map(cardKey));
  const holeCards: [Card, Card][] = [];

  for (let p = 0; p < config.numPlayers; p++) {
    const candidates = config.ranges[p].filter(
      ([a, b]) => !used.has(cardKey(a)) && !used.has(cardKey(b))
    );
    let picked: [Card, Card];
    if (candidates.length === 0) {
      const deck = fullDeck().filter((c) => !used.has(cardKey(c)));
      const a = deck[Math.floor(rng() * deck.length)];
      const deck2 = deck.filter((c) => cardKey(c) !== cardKey(a));
      const b = deck2[Math.floor(rng() * deck2.length)];
      picked = [a, b];
    } else {
      picked = candidates[Math.floor(rng() * candidates.length)];
    }
    used.add(cardKey(picked[0]));
    used.add(cardKey(picked[1]));
    holeCards.push(picked);
  }

  const pool = fullDeck().filter((c) => !used.has(cardKey(c)));
  const board = config.board.slice();
  while (board.length < 5) {
    const idx = Math.floor(rng() * pool.length);
    board.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return {
    holeCards,
    board,
    bucketCache: new Map<string, number>(),
    showdownScoreCache: new Map<number, number[]>(),
    rng,
  };
}
