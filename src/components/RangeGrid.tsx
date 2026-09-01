import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { RANKS, RANK_LABELS } from '../poker/cards';
import { Rank } from '../poker/types';
import { RangeGridEntry } from '../solver/solve';

interface Props {
  entries: RangeGridEntry[];
  /** Optionally highlight one exact hand (e.g. the user's real hole cards). */
  highlight?: { high: Rank; low: Rank; suited: boolean } | null;
}

function colorForAction(label: string): [number, number, number] {
  if (label === 'fold') return [154, 164, 178]; // gray
  if (label === 'check' || label === 'call') return [59, 130, 246]; // blue
  if (label === 'allin') return [153, 27, 27]; // dark red
  if (label.startsWith('bet') || label.startsWith('raise')) return [249, 115, 22]; // orange
  return [153, 153, 153];
}

function blendColor(actions: string[], freqs: number[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < actions.length; i++) {
    const [cr, cg, cb] = colorForAction(actions[i]);
    r += cr * freqs[i];
    g += cg * freqs[i];
    b += cb * freqs[i];
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

const { width } = Dimensions.get('window');
const CELL = Math.floor((width - 40) / 13);

export default function RangeGrid({ entries, highlight }: Props) {
  const byKey = new Map(entries.map((e) => [`${e.handType.high}-${e.handType.low}-${e.handType.suited}-${e.handType.isPair}`, e]));

  return (
    <View>
      <View style={styles.grid}>
        {RANKS.map((rowRank, rowIdx) => (
          <View key={rowRank} style={styles.row}>
            {RANKS.map((colRank, colIdx) => {
              const isPair = rowIdx === colIdx;
              const high = (rowIdx < colIdx ? rowRank : colRank) as Rank;
              const low = (rowIdx < colIdx ? colRank : rowRank) as Rank;
              // Upper-right triangle = suited, lower-left = offsuit (standard chart convention).
              const suited = rowIdx < colIdx;
              const key = `${high}-${low}-${isPair ? false : suited}-${isPair}`;
              const entry = byKey.get(key);
              const isHighlighted =
                !!highlight &&
                highlight.high === high &&
                highlight.low === low &&
                (isPair || highlight.suited === suited);
              const bg = entry?.strategy ? blendColor(entry.strategy.actions, entry.strategy.frequencies) : '#e5e7eb';
              return (
                <View
                  key={colRank}
                  style={[
                    styles.cell,
                    { width: CELL, height: CELL, backgroundColor: bg },
                    isHighlighted && styles.highlighted,
                  ]}
                >
                  <Text style={styles.cellText} numberOfLines={1} adjustsFontSizeToFit>
                    {RANK_LABELS[rowRank]}
                    {RANK_LABELS[colRank]}
                    {isPair ? '' : suited ? 's' : 'o'}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <LegendItem color="rgb(154,164,178)" label="フォールド" />
        <LegendItem color="rgb(59,130,246)" label="チェック/コール" />
        <LegendItem color="rgb(249,115,22)" label="ベット/レイズ" />
        <LegendItem color="rgb(153,27,27)" label="オールイン" />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { borderWidth: 1, borderColor: '#ccc', alignSelf: 'flex-start' },
  row: { flexDirection: 'row' },
  cell: {
    borderWidth: 0.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlighted: {
    borderWidth: 2,
    borderColor: '#111',
  },
  cellText: { fontSize: 8, fontWeight: '700', color: '#fff' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
  legendText: { fontSize: 10, color: '#555' },
});
