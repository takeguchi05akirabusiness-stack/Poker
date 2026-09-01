/**
 * Canonical seat/position lists for 2-10 player tables, in standard poker naming.
 * Order is not action order, just labels assigned to seats.
 */
export const POSITION_SETS: Record<number, string[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  10: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export function positionsForTableSize(n: number): string[] {
  const clamped = Math.max(2, Math.min(10, n));
  return POSITION_SETS[clamped];
}

/**
 * Default "opening range" as a top-X% of starting hands, by position label.
 * Rough reference values inspired by common GTO-ish charts; used only as a
 * starting point for the heuristic range estimator (see ranges.ts).
 */
export const DEFAULT_OPEN_PERCENT: Record<string, number> = {
  UTG: 10,
  'UTG+1': 12,
  'UTG+2': 13,
  MP: 15,
  'MP+1': 17,
  HJ: 20,
  CO: 27,
  BTN: 45,
  'BTN/SB': 45,
  SB: 35,
  BB: 30,
};

export function defaultOpenPercent(position: string): number {
  return DEFAULT_OPEN_PERCENT[position] ?? 20;
}
