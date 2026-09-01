import { Card, Rank, Suit } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export const RANK_LABELS: Record<Rank, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: 'T',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function removeCards(deck: Card[], used: Card[]): Card[] {
  const usedKeys = new Set(used.map(cardKey));
  return deck.filter((c) => !usedKeys.has(cardKey(c)));
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
