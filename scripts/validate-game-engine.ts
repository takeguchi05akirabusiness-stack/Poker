/**
 * Standalone validation script (not part of the app) for the heads-up live
 * game engine in src/cpu/gameEngine.ts: chip conservation across many
 * randomly-played hands, termination, and showdown correctness. Run with:
 *   npx tsx scripts/validate-game-engine.ts
 */
import {
  applyAction,
  canRaise,
  HandState,
  minRaiseTotalFor,
  SeatId,
  startHand,
  toCallFor,
} from '../src/cpu/gameEngine';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

function randomAction(hand: HandState, seat: SeatId): { type: 'fold' | 'check' | 'call' | 'bet'; amount?: number } {
  const toCall = toCallFor(hand, seat);
  const r = Math.random();
  if (toCall > 0) {
    if (r < 0.2) return { type: 'fold' };
    if (r < 0.7 || !canRaise(hand, seat)) return { type: 'call' };
    const min = minRaiseTotalFor(hand, seat);
    const max = hand.committedThisStreet[seat] + hand.stacks[seat];
    return { type: 'bet', amount: Math.min(max, Math.round(min + Math.random() * (max - min))) };
  }
  if (r < 0.6 || !canRaise(hand, seat)) return { type: 'check' };
  const min = minRaiseTotalFor(hand, seat);
  const max = hand.committedThisStreet[seat] + hand.stacks[seat];
  return { type: 'bet', amount: Math.min(max, Math.round(min + Math.random() * (max - min))) };
}

function playOneHand(stacks: [number, number], buttonIsHuman: boolean): HandState {
  let hand = startHand(stacks, buttonIsHuman);
  let steps = 0;
  while (!hand.handOver) {
    steps += 1;
    if (steps > 200) throw new Error('hand did not terminate (possible infinite loop)');
    const seat = hand.toAct;
    if (seat === null) throw new Error('toAct is null but hand is not over');
    const action = randomAction(hand, seat);
    hand = applyAction(hand, seat, action);
  }
  return hand;
}

function testChipConservation() {
  const TOTAL = 200; // 100BB each
  let stacks: [number, number] = [100, 100];
  let buttonIsHuman = true;
  for (let i = 0; i < 500; i++) {
    if (stacks[0] <= 0 || stacks[1] <= 0) {
      stacks = [100, 100]; // restart a fresh match once someone busts
    }
    const finished = playOneHand(stacks, buttonIsHuman);
    if (!finished.result) throw new Error('finished hand missing result');
    const winner = finished.result.winner;
    if (winner === 'split') {
      stacks[0] = finished.stacks[0] + finished.result.amountWon;
      stacks[1] = finished.stacks[1] + finished.result.amountWon;
    } else {
      stacks[winner] = finished.stacks[winner] + finished.result.amountWon;
      const loser: SeatId = winner === 0 ? 1 : 0;
      stacks[loser] = finished.stacks[loser];
    }
    const sum = stacks[0] + stacks[1];
    if (Math.abs(sum - TOTAL) > 1e-6) {
      assert(false, `chip conservation after hand ${i} (sum=${sum}, expected ${TOTAL})`);
      return;
    }
    buttonIsHuman = !buttonIsHuman;
  }
  assert(true, 'chip conservation holds across 500 randomly-played hands (with restarts on bust)');
}

function testAllInRunout() {
  // Both players shove preflop; the hand should resolve straight to showdown with a full board.
  let hand = startHand([20, 20], true);
  const seat = hand.toAct!;
  hand = applyAction(hand, seat, { type: 'bet', amount: hand.committedThisStreet[seat] + hand.stacks[seat] });
  const other: SeatId = seat === 0 ? 1 : 0;
  hand = applyAction(hand, other, { type: 'call' });
  assert(hand.handOver, 'all-in preflop call resolves immediately to a finished hand');
  assert(hand.board.length === 5, 'all-in runout deals the full 5-card board');
  assert(hand.stacks[0] === 0 && hand.stacks[1] === 0, 'both stacks are fully committed after an all-in call');
  assert(!!hand.result && hand.result.reason === 'showdown', 'all-in runout ends in a showdown');
}

function testFoldEndsImmediately() {
  let hand = startHand([100, 100], true);
  const seat = hand.toAct!; // preflop, button/SB acts first
  hand = applyAction(hand, seat, { type: 'fold' });
  assert(hand.handOver, 'folding ends the hand immediately');
  assert(!hand.revealCpuHand, 'folding does not reveal the CPU hand (mucked)');
  const other: SeatId = seat === 0 ? 1 : 0;
  assert(hand.result?.winner === other, 'the non-folding player wins on a fold');
}

function main() {
  testFoldEndsImmediately();
  testAllInRunout();
  testChipConservation();
}

main();
