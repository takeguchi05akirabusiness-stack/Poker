/**
 * Standalone validation script (not part of the app) for src/cpu/cpuDecision.ts:
 * checks the CPU's continually-resolved action is always legal given the live
 * game state, and that applying it back through the game engine keeps chips
 * conserved. Run with: npx tsx scripts/validate-cpu-decision.ts
 */
import { Card } from '../src/poker/types';
import { applyAction, HandState, startHand, toCallFor } from '../src/cpu/gameEngine';
import { CPU_STRENGTHS, decideCpuAction } from '../src/cpu/cpuDecision';

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

async function testCpuFacingSmallBlindCompletion() {
  // cpu is SB/BTN preflop: faces only a 0.5BB toCall to complete to the BB, with position for
  // the rest of the hand. A well-behaved (even if crude) heuristic should rarely fold this cheap
  // a spot heads-up, since limping/raising is almost always better than conceding 0.5BB blind.
  let hand = startHand([100, 100], false); // human is BB, cpu is BTN/SB -> cpu acts first preflop
  assert(hand.toAct === 1, 'cpu (sb) acts first preflop when human is bb');
  assert(toCallFor(hand, 1) === 0.5, 'cpu faces exactly the 0.5bb small-blind completion, not a real bet');
  const before = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  const { action, strategy } = await decideCpuAction(hand, CPU_STRENGTHS.weak);
  console.log('cpu (sb completing the blind) strategy:', strategy.actions.map((a, i) => `${a}:${(strategy.frequencies[i] * 100).toFixed(0)}%`).join(' '));
  assert(
    strategy.frequencies[strategy.actions.indexOf('fold')] < 0.5,
    'cpu should not be folding the sb more often than not for a mere 0.5bb completion'
  );
  hand = applyAction(hand, 1, action);
  const after = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  assert(Math.abs(before - after) < 1e-6, 'chip total conserved after cpu action (sb completion)');
}

async function testCpuFacingBet() {
  let hand = startHand([100, 100], true); // human BTN/SB acts first preflop
  hand = applyAction(hand, 0, { type: 'bet', amount: 20 }); // human raises to 20
  assert(hand.toAct === 1, 'cpu faces the human raise next');
  const before = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  const { action, strategy } = await decideCpuAction(hand, CPU_STRENGTHS.normal);
  console.log('cpu (facing a 20BB raise) strategy:', strategy.actions.map((a, i) => `${a}:${(strategy.frequencies[i] * 100).toFixed(0)}%`).join(' '));
  const toCall = toCallFor(hand, 1);
  if (action.type === 'call' || action.type === 'fold') {
    // fine
  } else {
    assert((action.amount ?? 0) > hand.committedThisStreet[1] + toCall - 1e-6, 'a raise/allin action increases commitment beyond a plain call');
    assert((action.amount ?? 0) <= hand.stacks[1] + hand.committedThisStreet[1] + 1e-6, 'a raise/allin action never exceeds the cpu stack');
  }
  hand = applyAction(hand, 1, action);
  const after = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  assert(Math.abs(before - after) < 1e-6, 'chip total conserved after cpu action (facing a bet)');
}

async function testCpuShortStackFacingBet() {
  // cpu covers only 8BB behind; human shoves. cpu can only fold or call all-in (no raise room).
  let hand = startHand([100, 8], true);
  hand = applyAction(hand, 0, { type: 'bet', amount: 100 }); // human shoves
  assert(hand.toAct === 1, 'short-stacked cpu faces the shove');
  const { action } = await decideCpuAction(hand, CPU_STRENGTHS.weak);
  assert(action.type === 'fold' || action.type === 'call', 'a covered cpu can only fold or call an all-in, never raise');
  const before = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  hand = applyAction(hand, 1, action);
  const after = hand.stacks[0] + hand.stacks[1] + hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  assert(Math.abs(before - after) < 1e-6, 'chip total conserved for the short-stacked cpu decision');
}

async function main() {
  await testCpuFacingSmallBlindCompletion();
  await testCpuFacingBet();
  await testCpuShortStackFacingBet();
}

main();
