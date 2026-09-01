import { useMemo, useState } from 'react';
import { Card, PlayerState, ActionRecord, ActionType } from '../poker/types';
import { positionsForTableSize } from '../poker/positions';
import { estimateRangeBand, combosForBand } from '../poker/ranges';
import { simulateEquity } from '../poker/equity';
import { cardKey } from '../poker/cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `p${idCounter}`;
}

function buildPlayers(tableSize: number, heroSeatIndex: number): PlayerState[] {
  const positions = positionsForTableSize(tableSize);
  return positions.map((position, index) => ({
    id: nextId(),
    position,
    isHero: index === heroSeatIndex,
    folded: false,
    actions: [],
    rangeBand: { top: 0, bottom: 100 },
  }));
}

export function useHandSession() {
  const [tableSize, setTableSizeState] = useState(6);
  const [heroSeatIndex, setHeroSeatIndex] = useState(0);
  const [players, setPlayers] = useState<PlayerState[]>(() => buildPlayers(6, 0));
  const [heroCards, setHeroCards] = useState<(Card | null)[]>([null, null]);
  const [board, setBoard] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [street, setStreet] = useState<Street>('preflop');

  function setTableSize(n: number) {
    const clamped = Math.max(2, Math.min(10, n));
    const clampedHero = Math.min(heroSeatIndex, clamped - 1);
    setHeroSeatIndex(clampedHero);
    setPlayers(buildPlayers(clamped, clampedHero));
    setHeroCards([null, null]);
    setBoard([null, null, null, null, null]);
    setStreet('preflop');
    setTableSizeState(clamped);
  }

  function setHeroSeat(index: number) {
    setHeroSeatIndex(index);
    setPlayers((prev) => prev.map((p, i) => ({ ...p, isHero: i === index })));
  }

  function newHand() {
    setPlayers(buildPlayers(tableSize, heroSeatIndex));
    setHeroCards([null, null]);
    setBoard([null, null, null, null, null]);
    setStreet('preflop');
  }

  function recordAction(playerId: string, type: ActionType) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId) return p;
        const action: ActionRecord = { street, type };
        const folded = type === 'fold' ? true : p.folded;
        return { ...p, actions: [...p.actions, action], folded };
      })
    );
  }

  function undoLastAction(playerId: string) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== playerId || p.actions.length === 0) return p;
        const actions = p.actions.slice(0, -1);
        const folded = actions.some((a) => a.type === 'fold');
        return { ...p, actions, folded };
      })
    );
  }

  function setHeroCard(slot: 0 | 1, card: Card | null) {
    setHeroCards((prev) => {
      const next = [...prev];
      next[slot] = card;
      return next;
    });
  }

  function setBoardCard(slot: number, card: Card | null) {
    setBoard((prev) => {
      const next = [...prev];
      next[slot] = card;
      return next;
    });
  }

  function advanceStreet(next: Street) {
    setStreet(next);
  }

  const usedCards = useMemo(() => {
    const cards = [...heroCards, ...board].filter((c): c is Card => c !== null);
    return new Set(cards.map(cardKey));
  }, [heroCards, board]);

  const activeOpponents = useMemo(
    () => players.filter((p) => !p.isHero && !p.folded),
    [players]
  );

  const playersWithRanges = useMemo(
    () =>
      players.map((p) => ({
        ...p,
        rangeBand: p.isHero ? p.rangeBand : estimateRangeBand(p.position, p.actions),
      })),
    [players]
  );

  const equity = useMemo(() => {
    const hCards = heroCards.filter((c): c is Card => c !== null);
    if (hCards.length !== 2) return null;
    const boardCards = board.filter((c): c is Card => c !== null);
    const opponents = playersWithRanges.filter((p) => !p.isHero && !p.folded);
    if (opponents.length === 0) {
      return { winPercent: 100, tiePercent: 0, lossPercent: 0, trials: 0 };
    }
    const opponentInputs = opponents.map((p) => ({ combos: combosForBand(p.rangeBand) }));
    return simulateEquity([hCards[0], hCards[1]], boardCards, opponentInputs);
  }, [heroCards, board, playersWithRanges]);

  return {
    tableSize,
    setTableSize,
    heroSeatIndex,
    setHeroSeat,
    players: playersWithRanges,
    heroCards,
    setHeroCard,
    board,
    setBoardCard,
    street,
    advanceStreet,
    recordAction,
    undoLastAction,
    newHand,
    usedCards,
    activeOpponents,
    equity,
  };
}
