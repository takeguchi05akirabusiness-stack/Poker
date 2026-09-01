/**
 * Standalone validation script (not part of the app) for the generic CFR
 * engine in src/solver/cfr.ts. Solves Kuhn poker, whose Nash equilibrium
 * game value to player 1 is a well-known closed form (-1/18), and checks
 * our implementation converges to it. Run with: npx tsx scripts/validate-cfr.ts
 */
import { CfrTrainer, PublicNode } from '../src/solver/cfr';

type KuhnWorld = { cards: [number, number] }; // player0 card, player1 card (0=J,1=Q,2=K)

function terminal(payoff: (w: KuhnWorld) => number[]): PublicNode<KuhnWorld> {
  return { type: 'terminal', payoff };
}

function showdownPayoff(pot: number): (w: KuhnWorld) => number[] {
  return (w) => {
    const [c0, c1] = w.cards;
    const half = pot / 2;
    if (c0 > c1) return [half, -half];
    return [-half, half];
  };
}

let nextId = 0;
function decision(
  player: number,
  actions: string[],
  history: string,
  children: PublicNode<KuhnWorld>[]
): PublicNode<KuhnWorld> {
  return {
    type: 'decision',
    id: nextId++,
    player,
    actions,
    infoSet: (w) => `${player}:${w.cards[player]}:${history}`,
    children,
  };
}

// Standard Kuhn poker tree (ante 1 each, one bet size of 1).
// Terminal payoffs are net winnings relative to the antes already posted.
function buildKuhnTree(): PublicNode<KuhnWorld> {
  // P1 bet, P2 call -> showdown, pot 4, net +-2
  const p1BetP2Call = terminal(showdownPayoff(4));
  // P1 bet, P2 fold -> P1 wins net +1, P2 net -1
  const p1BetP2Fold = terminal(() => [1, -1]);
  const afterP1Bet = decision(1, ['fold', 'call'], 'b', [p1BetP2Fold, p1BetP2Call]);

  // P1 pass, P2 pass -> showdown, pot 2, net +-1
  const bothPass = terminal(showdownPayoff(2));
  // P1 pass, P2 bet, P1 fold -> P2 wins net +1, P1 net -1
  const p2BetP1Fold = terminal(() => [-1, 1]);
  // P1 pass, P2 bet, P1 call -> showdown, pot 4, net +-2
  const p2BetP1Call = terminal(showdownPayoff(4));
  const afterP2Bet = decision(0, ['fold', 'call'], 'pb', [p2BetP1Fold, p2BetP1Call]);
  const afterP1Pass = decision(1, ['pass', 'bet'], 'p', [bothPass, afterP2Bet]);

  return decision(0, ['pass', 'bet'], '', [afterP1Pass, afterP1Bet]);
}

function sampleWorld(rng: () => number): KuhnWorld {
  const deck = [0, 1, 2];
  const i = Math.floor(rng() * 3);
  const c0 = deck[i];
  const rest = deck.filter((_, idx) => idx !== i);
  const j = Math.floor(rng() * 2);
  const c1 = rest[j];
  return { cards: [c0, c1] };
}

function main() {
  const root = buildKuhnTree();
  const trainer = new CfrTrainer<KuhnWorld>(2);
  const iterations = 200000;
  let rngState = 12345;
  const rng = () => {
    // simple deterministic LCG for reproducibility
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
  };

  for (let i = 0; i < iterations; i++) {
    trainer.runIteration(root, sampleWorld(rng));
  }

  // Compute exact expected value under the trained average strategy by
  // enumerating all 6 equally-likely deals (Kuhn poker is tiny enough).
  function avgStrategyAt(node: PublicNode<KuhnWorld>, world: KuhnWorld): number[] {
    if (node.type !== 'decision') throw new Error('not a decision node');
    const key = node.infoSet(world);
    return trainer.averageStrategy(key) ?? node.actions.map(() => 1 / node.actions.length);
  }

  function expectedValue(node: PublicNode<KuhnWorld>, world: KuhnWorld): number[] {
    if (node.type === 'terminal') return node.payoff(world);
    const strategy = avgStrategyAt(node, world);
    const total = new Array(2).fill(0);
    for (let i = 0; i < node.children.length; i++) {
      const util = expectedValue(node.children[i], world);
      total[0] += strategy[i] * util[0];
      total[1] += strategy[i] * util[1];
    }
    return total;
  }

  const deals: KuhnWorld[] = [];
  for (const c0 of [0, 1, 2]) {
    for (const c1 of [0, 1, 2]) {
      if (c0 !== c1) deals.push({ cards: [c0, c1] });
    }
  }
  let value0 = 0;
  for (const w of deals) {
    const ev = expectedValue(root, w);
    value0 += ev[0];
  }
  value0 /= deals.length;

  const expected = -1 / 18;
  console.log(`Player 1 expected value: ${value0.toFixed(4)} (expected ~${expected.toFixed(4)})`);
  const diff = Math.abs(value0 - expected);
  if (diff < 0.01) {
    console.log('OK: CFR engine converges to the known Kuhn poker equilibrium value.');
  } else {
    console.error(`FAIL: difference ${diff.toFixed(4)} exceeds tolerance.`);
    process.exitCode = 1;
  }
}

main();
