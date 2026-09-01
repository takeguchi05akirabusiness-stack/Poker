import { Card } from '../poker/types';
import { fullDeck, shuffle } from '../poker/cards';
import { compareScores, evaluateBest } from '../poker/evaluator';
import { Street, STREET_ORDER } from '../solver/types';

/** Player 0 is always the human, player 1 is always the CPU. */
export type SeatId = 0 | 1;

export type LiveActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface HandActionLogEntry {
  player: SeatId;
  street: Street;
  type: LiveActionType;
  amount: number;
}

export interface HandState {
  buttonIsHuman: boolean;
  street: Street;
  board: Card[];
  /** The complete 5-card runout, dealt up front so revealing later streets is deterministic. */
  fullBoard: Card[];
  holeCards: [[Card, Card], [Card, Card]];
  /** Remaining stack behind for each seat, live-updated as the hand progresses. */
  stacks: [number, number];
  /** Chips already locked in from completed streets (does not include committedThisStreet). */
  potBB: number;
  committedThisStreet: [number, number];
  numRaisesThisStreet: number;
  lastRaiseIncrement: number;
  /** Seats that still need to act before the current betting round can close. */
  pendingToAct: Set<SeatId>;
  toAct: SeatId | null;
  handOver: boolean;
  revealCpuHand: boolean;
  log: HandActionLogEntry[];
  result: { winner: SeatId | 'split'; amountWon: number; reason: 'fold' | 'showdown' } | null;
}

export const SMALL_BLIND = 0.5;
export const BIG_BLIND = 1;

function boardLenFor(street: Street): number {
  return street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
}

export function startHand(stacks: [number, number], buttonIsHuman: boolean): HandState {
  const deck = shuffle(fullDeck());
  const holeCards: [[Card, Card], [Card, Card]] = [
    [deck[0], deck[1]],
    [deck[2], deck[3]],
  ];
  const board = deck.slice(4, 9);

  const sbSeat: SeatId = buttonIsHuman ? 0 : 1;
  const bbSeat: SeatId = buttonIsHuman ? 1 : 0;
  const sbAmount = Math.min(SMALL_BLIND, stacks[sbSeat]);
  const bbAmount = Math.min(BIG_BLIND, stacks[bbSeat]);

  const liveStacks: [number, number] = [...stacks];
  liveStacks[sbSeat] -= sbAmount;
  liveStacks[bbSeat] -= bbAmount;
  const committedThisStreet: [number, number] = [0, 0];
  committedThisStreet[sbSeat] = sbAmount;
  committedThisStreet[bbSeat] = bbAmount;

  const pendingToAct = new Set<SeatId>([0, 1].filter((s) => liveStacks[s as SeatId] > 0) as SeatId[]);

  return {
    buttonIsHuman,
    street: 'preflop',
    board: [],
    fullBoard: board,
    holeCards,
    stacks: liveStacks,
    potBB: 0,
    committedThisStreet,
    numRaisesThisStreet: 0,
    lastRaiseIncrement: BIG_BLIND,
    pendingToAct,
    toAct: pendingToAct.has(sbSeat) ? sbSeat : pendingToAct.has(bbSeat) ? bbSeat : null,
    handOver: false,
    revealCpuHand: false,
    log: [],
    result: null,
  };
}

export function toCallFor(hand: HandState, seat: SeatId): number {
  const other = (1 - seat) as SeatId;
  return Math.max(0, hand.committedThisStreet[other] - hand.committedThisStreet[seat]);
}

export function minRaiseTotalFor(hand: HandState, seat: SeatId): number {
  const other = (1 - seat) as SeatId;
  const maxCommitted = Math.max(hand.committedThisStreet[0], hand.committedThisStreet[1]);
  const target = maxCommitted + hand.lastRaiseIncrement;
  return Math.min(target, hand.committedThisStreet[seat] + hand.stacks[seat]);
}

function otherSeatHasChips(hand: HandState, seat: SeatId): boolean {
  return hand.stacks[(1 - seat) as SeatId] > 0;
}

/** Whether `seat` is currently allowed to bet/raise (not just call/fold). */
export function canRaise(hand: HandState, seat: SeatId): boolean {
  return hand.stacks[seat] > toCallFor(hand, seat) && otherSeatHasChips(hand, seat);
}

function showdownResult(hand: HandState): { winner: SeatId | 'split'; amountWon: number } {
  const pot = hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  const board = hand.fullBoard;
  const scoreHuman = evaluateBest([...hand.holeCards[0], ...board]);
  const scoreCpu = evaluateBest([...hand.holeCards[1], ...board]);
  const cmp = compareScores(scoreHuman, scoreCpu);
  if (cmp === 0) return { winner: 'split', amountWon: pot / 2 };
  return { winner: cmp > 0 ? 0 : 1, amountWon: pot };
}

function closeStreetAndAdvance(hand: HandState): HandState {
  const potBB = hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  const bbSeat: SeatId = hand.buttonIsHuman ? 1 : 0;

  let street = hand.street;
  let board = hand.board;
  while (true) {
    if (street === 'river') {
      const finished: HandState = {
        ...hand,
        potBB,
        committedThisStreet: [0, 0],
        board,
        handOver: true,
        revealCpuHand: true,
        toAct: null,
        result: { ...showdownResult({ ...hand, potBB, board, committedThisStreet: [0, 0] }), reason: 'showdown' },
      };
      return finished;
    }
    street = STREET_ORDER[STREET_ORDER.indexOf(street) + 1];
    board = hand.fullBoard.slice(0, boardLenFor(street));
    const pendingToAct = new Set<SeatId>([0, 1].filter((s) => hand.stacks[s as SeatId] > 0) as SeatId[]);
    if (pendingToAct.size >= 2) {
      return {
        ...hand,
        street,
        board,
        potBB,
        committedThisStreet: [0, 0],
        numRaisesThisStreet: 0,
        lastRaiseIncrement: BIG_BLIND,
        pendingToAct,
        toAct: bbSeat,
      };
    }
    // Someone is all-in: run this street out with no further action.
  }
}

export interface LiveAction {
  type: LiveActionType;
  /** Additional chips put in this action (ignored for fold/check). */
  amount?: number;
}

export function applyAction(hand: HandState, seat: SeatId, action: LiveAction): HandState {
  if (hand.handOver || hand.toAct !== seat) return hand;
  const other: SeatId = (1 - seat) as SeatId;

  if (action.type === 'fold') {
    const pot = hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
    return {
      ...hand,
      handOver: true,
      revealCpuHand: false,
      toAct: null,
      result: { winner: other, amountWon: pot, reason: 'fold' },
      log: [...hand.log, { player: seat, street: hand.street, type: 'fold', amount: 0 }],
    };
  }

  const stacks: [number, number] = [...hand.stacks];
  const committedThisStreet: [number, number] = [...hand.committedThisStreet];
  let numRaisesThisStreet = hand.numRaisesThisStreet;
  let lastRaiseIncrement = hand.lastRaiseIncrement;
  const pendingToAct = new Set(hand.pendingToAct);
  pendingToAct.delete(seat);

  if (action.type === 'check' || action.type === 'call') {
    const amount = Math.min(toCallFor(hand, seat), stacks[seat]);
    stacks[seat] -= amount;
    committedThisStreet[seat] += amount;
  } else {
    // bet / raise / allin: action.amount is the new TOTAL committed-this-street for `seat`.
    const maxCommitted = Math.max(committedThisStreet[0], committedThisStreet[1]);
    const desiredTotal = Math.min(action.amount ?? stacks[seat] + committedThisStreet[seat], stacks[seat] + committedThisStreet[seat]);
    const increment = desiredTotal - committedThisStreet[seat];
    stacks[seat] -= increment;
    committedThisStreet[seat] = desiredTotal;
    lastRaiseIncrement = Math.max(lastRaiseIncrement, desiredTotal - maxCommitted);
    numRaisesThisStreet += 1;
    pendingToAct.clear();
    if (otherSeatHasChips(hand, other)) pendingToAct.add(other);
  }

  const logged: HandState = {
    ...hand,
    stacks,
    committedThisStreet,
    numRaisesThisStreet,
    lastRaiseIncrement,
    pendingToAct,
    log: [...hand.log, { player: seat, street: hand.street, type: action.type, amount: action.amount ?? 0 }],
  };

  if (pendingToAct.size === 0) {
    return closeStreetAndAdvance(logged);
  }
  const next = pendingToAct.has(other) ? other : seat;
  return { ...logged, toAct: next };
}
