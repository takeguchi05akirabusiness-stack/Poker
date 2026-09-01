export type Suit = 'S' | 'H' | 'D' | 'C';

// 2-10, 11=J, 12=Q, 13=K, 14=A
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type ActionType = 'fold' | 'limp' | 'call' | 'raise' | 'reraise' | 'check' | 'bet';

export interface ActionRecord {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  type: ActionType;
}

export interface PlayerState {
  id: string;
  position: string;
  isHero: boolean;
  folded: boolean;
  actions: ActionRecord[];
  /** Estimated range as a percentile band [top, bottom] of the 169 starting hands, 0-100. */
  rangeBand: { top: number; bottom: number };
}

export interface EquityResult {
  winPercent: number;
  tiePercent: number;
  lossPercent: number;
  trials: number;
}
