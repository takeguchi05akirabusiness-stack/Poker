/**
 * Standalone validation script (not part of the app) for the Hold'em
 * solver: bet-tree construction, payoff conservation, betting-round
 * closure, and an end-to-end sanity solve. Run with:
 *   npx tsx scripts/validate-solver.ts
 */
import { Card } from '../src/poker/types';
import { combosForBand } from '../src/poker/ranges';
import { buildTree, sampleWorld } from '../src/solver/tree';
import { solveSpot, strategyForHand } from '../src/solver/solve';
import { defaultBetAbstraction, SpotConfig } from '../src/solver/types';
import { PublicNode } from '../src/solver/cfr';
import { HoldemWorld } from '../src/solver/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

function c(spec: string): Card {
  const rankChar = spec.slice(0, -1);
  const suitChar = spec.slice(-1).toUpperCase() as Card['suit'];
  const map: Record<string, number> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
  };
  return { rank: map[rankChar] as Card['rank'], suit: suitChar };
}

function countNodes(node: PublicNode<HoldemWorld>): { decisions: number; terminals: number } {
  if (node.type === 'terminal') return { decisions: 0, terminals: 1 };
  let decisions = 1;
  let terminals = 0;
  for (const child of node.children) {
    const r = countNodes(child);
    decisions += r.decisions;
    terminals += r.terminals;
  }
  return { decisions, terminals };
}

function walkAllTerminalPayoffs(node: PublicNode<HoldemWorld>, world: HoldemWorld, cb: (p: number[]) => void) {
  if (node.type === 'terminal') {
    cb(node.payoff(world));
    return;
  }
  for (const child of node.children) walkAllTerminalPayoffs(child, world, cb);
}

function fullRangeCombos(): [Card, Card][] {
  return combosForBand({ top: 0, bottom: 100 });
}

// --- Test 1: payoff conservation across many configs/worlds ---
function testPayoffConservation() {
  const configs: SpotConfig[] = [
    {
      numPlayers: 2,
      actingOrder: [0, 1],
      effectiveStackBB: 100,
      potBB: 6,
      startStreet: 'flop',
      board: [c('7d'), c('2c'), c('9h')],
      ranges: [fullRangeCombos(), fullRangeCombos()],
      betAbstraction: defaultBetAbstraction(),
      numBuckets: 6,
      postflopTrials: 10,
    },
    {
      numPlayers: 3,
      actingOrder: [0, 1, 2],
      effectiveStackBB: 40,
      potBB: 10,
      startStreet: 'turn',
      board: [c('7d'), c('2c'), c('9h'), c('Ks')],
      ranges: [fullRangeCombos(), fullRangeCombos(), fullRangeCombos()],
      betAbstraction: {
        preflop: { potFractions: [1], raiseCap: 1 },
        flop: { potFractions: [0.5, 1], raiseCap: 2 },
        turn: { potFractions: [0.5, 1], raiseCap: 2 },
        river: { potFractions: [1], raiseCap: 1 },
      },
      numBuckets: 5,
      postflopTrials: 8,
    },
    {
      numPlayers: 2,
      actingOrder: [0, 1],
      effectiveStackBB: 3, // very short stack: forces frequent all-ins
      potBB: 20,
      startStreet: 'preflop',
      board: [],
      ranges: [fullRangeCombos(), fullRangeCombos()],
      betAbstraction: defaultBetAbstraction(),
      numBuckets: 4,
      postflopTrials: 6,
    },
  ];

  for (const [idx, config] of configs.entries()) {
    const { root } = buildTree(config);
    const counts = countNodes(root);
    console.log(`config[${idx}]: ${counts.decisions} decision nodes, ${counts.terminals} terminal nodes`);
    for (let t = 0; t < 20; t++) {
      const world = sampleWorld(config, Math.random);
      let allOk = true;
      walkAllTerminalPayoffs(root, world, (payoff) => {
        const sum = payoff.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - config.potBB) > 1e-6) allOk = false;
      });
      if (!allOk) {
        assert(false, `config[${idx}] payoff conservation (trial ${t})`);
        return;
      }
    }
    assert(true, `config[${idx}] payoff conservation holds at every terminal across sampled worlds`);
  }
}

// --- Test 2: betting round closure / raise cap structural checks ---
function testBettingStructure() {
  const config: SpotConfig = {
    numPlayers: 2,
    actingOrder: [0, 1],
    effectiveStackBB: 100,
    potBB: 10,
    startStreet: 'river',
    board: [c('7d'), c('2c'), c('9h'), c('Ks'), c('3s')],
    ranges: [fullRangeCombos(), fullRangeCombos()],
    betAbstraction: {
      preflop: { potFractions: [1], raiseCap: 1 },
      flop: { potFractions: [1], raiseCap: 1 },
      turn: { potFractions: [1], raiseCap: 1 },
      river: { potFractions: [0.5, 1], raiseCap: 1 },
    },
    numBuckets: 4,
    postflopTrials: 6,
  };
  const { root } = buildTree(config);
  assert(root.type === 'decision', 'river root is a decision node');
  if (root.type !== 'decision') return;
  assert(root.player === 0, 'first actor is player 0 (per actingOrder)');
  assert(root.actions.includes('check'), 'first actor can check with no bet in front');
  assert(!root.actions.includes('fold'), 'first actor cannot fold with no bet in front');

  const betChild = root.children[root.actions.findIndex((a) => a.startsWith('bet'))];
  assert(betChild.type === 'decision', 'facing a bet leads to another decision node');
  if (betChild.type === 'decision') {
    assert(betChild.actions.includes('fold') && betChild.actions.includes('call'), 'facing a bet: fold/call available');
    assert(!betChild.actions.some((a) => a.startsWith('raise')), 'raise cap of 1 forbids re-raising after a bet');
  }

  const checkChild = root.children[root.actions.indexOf('check')];
  assert(checkChild.type === 'decision', 'check-check on the (only) river street still lets player 1 act once');
  if (checkChild.type === 'decision') {
    assert(checkChild.player === 1, 'second actor to act after a check is player 1');
    const bothCheckChild = checkChild.children[checkChild.actions.indexOf('check')];
    assert(bothCheckChild.type === 'terminal', 'check-check on the river ends the hand at showdown');
  }
}

// --- Test 3: end-to-end sanity solve (nut hand should play more aggressively than trash) ---
async function testSanitySolve() {
  const board = [c('7d'), c('2c'), c('9h'), c('Ks'), c('3s')];
  const nutCombo: [Card, Card] = [c('Kh'), c('Kd')]; // top set of kings on this board
  const trashCombo: [Card, Card] = [c('4h'), c('5c')]; // busted draw / air

  const config: SpotConfig = {
    numPlayers: 2,
    actingOrder: [0, 1],
    effectiveStackBB: 60,
    potBB: 10,
    startStreet: 'river',
    board,
    ranges: [[nutCombo, trashCombo], fullRangeCombos()],
    betAbstraction: {
      preflop: { potFractions: [1], raiseCap: 1 },
      flop: { potFractions: [1], raiseCap: 1 },
      turn: { potFractions: [1], raiseCap: 1 },
      river: { potFractions: [0.75], raiseCap: 1 },
    },
    numBuckets: 8,
    postflopTrials: 12,
  };

  const result = await solveSpot(config, 4000);
  if (result.root.type !== 'decision') {
    assert(false, 'root should be a decision node for player 0 to act on the river');
    return;
  }
  const nutStrategy = strategyForHand(result, result.root, nutCombo, 'river', board);
  const trashStrategy = strategyForHand(result, result.root, trashCombo, 'river', board);
  if (!nutStrategy || !trashStrategy) {
    assert(false, 'strategyForHand returned a result for both hands');
    return;
  }
  const nutBetFreq = nutStrategy.actions
    .map((a, i) => (a !== 'check' ? nutStrategy.frequencies[i] : 0))
    .reduce((a, b) => a + b, 0);
  const trashBetFreq = trashStrategy.actions
    .map((a, i) => (a !== 'check' ? trashStrategy.frequencies[i] : 0))
    .reduce((a, b) => a + b, 0);
  console.log(`nut hand bet/allin frequency: ${(nutBetFreq * 100).toFixed(1)}%`);
  console.log(`trash hand bet/allin frequency: ${(trashBetFreq * 100).toFixed(1)}%`);
  assert(nutBetFreq > trashBetFreq, 'the effective nuts bets more often than pure air with the same action set');

  for (const strat of [nutStrategy, trashStrategy]) {
    const sum = strat.frequencies.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1) < 1e-6, 'strategy frequencies sum to 1');
  }
}

async function main() {
  testPayoffConservation();
  testBettingStructure();
  await testSanitySolve();
}

main();
