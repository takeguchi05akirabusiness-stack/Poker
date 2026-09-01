/**
 * End-to-end integration check (not part of the app): plays several full
 * heads-up hands wiring the real game engine together with the real
 * continually-resolving CPU decision-maker (the same composition
 * CpuMatchScreen uses), with a random legal-action policy standing in for
 * the human. Verifies chip conservation and termination. Run with:
 *   npx tsx scripts/validate-cpu-match-integration.ts
 */
import { applyAction, canRaise, HandState, minRaiseTotalFor, SeatId, startHand, toCallFor } from '../src/cpu/gameEngine';
import { CPU_STRENGTHS, decideCpuAction } from '../src/cpu/cpuDecision';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

function randomHumanAction(hand: HandState) {
  const toCall = toCallFor(hand, 0);
  const r = Math.random();
  if (toCall > 0) {
    if (r < 0.25) return { type: 'fold' as const };
    if (r < 0.75 || !canRaise(hand, 0)) return { type: 'call' as const };
    const min = minRaiseTotalFor(hand, 0);
    const max = hand.committedThisStreet[0] + hand.stacks[0];
    return { type: 'raise' as const, amount: Math.min(max, Math.round(min + Math.random() * (max - min))) };
  }
  if (r < 0.6 || !canRaise(hand, 0)) return { type: 'check' as const };
  const min = minRaiseTotalFor(hand, 0);
  const max = hand.committedThisStreet[0] + hand.stacks[0];
  return { type: 'bet' as const, amount: Math.min(max, Math.round(min + Math.random() * (max - min))) };
}

async function playHand(stacks: [number, number], buttonIsHuman: boolean): Promise<HandState> {
  let hand = startHand(stacks, buttonIsHuman);
  let steps = 0;
  while (!hand.handOver) {
    steps += 1;
    if (steps > 100) throw new Error('hand did not terminate');
    if (hand.toAct === 0) {
      hand = applyAction(hand, 0, randomHumanAction(hand));
    } else {
      const { action } = await decideCpuAction(hand, CPU_STRENGTHS.weak);
      hand = applyAction(hand, 1, action);
    }
  }
  return hand;
}

async function main() {
  const TOTAL = 200;
  let stacks: [number, number] = [100, 100];
  let buttonIsHuman = true;
  for (let i = 0; i < 6; i++) {
    if (stacks[0] <= 0 || stacks[1] <= 0) stacks = [100, 100];
    const finished = await playHand(stacks, buttonIsHuman);
    const result = finished.result!;
    const settled: [number, number] = [...finished.stacks] as [number, number];
    if (result.winner === 'split') {
      settled[0] += result.amountWon;
      settled[1] += result.amountWon;
    } else {
      settled[result.winner] += result.amountWon;
    }
    const sum = settled[0] + settled[1];
    console.log(
      `hand ${i}: winner=${result.winner} reason=${result.reason} amount=${result.amountWon.toFixed(1)} stacks=${settled.map((s) => s.toFixed(1))}`
    );
    assert(Math.abs(sum - TOTAL) < 1e-6, `chip conservation after full cpu-integrated hand ${i}`);
    stacks = settled;
    buttonIsHuman = !buttonIsHuman;
  }
}

main();
