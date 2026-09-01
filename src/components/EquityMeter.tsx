import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EquityResult } from '../poker/types';

interface Props {
  equity: EquityResult | null;
  opponentCount: number;
}

export default function EquityMeter({ equity, opponentCount }: Props) {
  if (!equity) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>ハンドを選択すると勝率が表示されます</Text>
      </View>
    );
  }

  const win = Math.max(0, Math.min(100, equity.winPercent));
  const tie = Math.max(0, Math.min(100 - win, equity.tiePercent));
  const lose = Math.max(0, 100 - win - tie);

  return (
    <View style={styles.container}>
      <Text style={styles.bigNumber}>{(win + tie).toFixed(1)}%</Text>
      <Text style={styles.subLabel}>
        勝ち {win.toFixed(1)}% ・ 引き分け {tie.toFixed(1)}% ・ 対戦相手 {opponentCount}人
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barWin, { flex: win || 0.0001 }]} />
        <View style={[styles.barTie, { flex: tie || 0.0001 }]} />
        <View style={[styles.barLose, { flex: lose || 0.0001 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#101317',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  placeholder: {
    color: '#9aa4b2',
    textAlign: 'center',
    paddingVertical: 8,
  },
  bigNumber: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  subLabel: {
    color: '#9aa4b2',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  barTrack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  barWin: { backgroundColor: '#33c26a' },
  barTie: { backgroundColor: '#e0c341' },
  barLose: { backgroundColor: '#e24c4c' },
});
