import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionType, PlayerState } from '../poker/types';
import { Street } from '../state/useHandSession';

interface Props {
  player: PlayerState;
  street: Street;
  onAction: (type: ActionType) => void;
  onUndo: () => void;
}

const PREFLOP_ACTIONS: { label: string; type: ActionType }[] = [
  { label: 'フォールド', type: 'fold' },
  { label: 'リンプ', type: 'limp' },
  { label: 'コール', type: 'call' },
  { label: 'レイズ', type: 'raise' },
  { label: '3ベット+', type: 'reraise' },
];

const POSTFLOP_ACTIONS: { label: string; type: ActionType }[] = [
  { label: 'フォールド', type: 'fold' },
  { label: 'チェック', type: 'check' },
  { label: 'コール', type: 'call' },
  { label: 'ベット', type: 'bet' },
  { label: 'レイズ', type: 'raise' },
];

const STREET_CODE: Record<Street, string> = {
  preflop: 'PF',
  flop: 'FL',
  turn: 'TN',
  river: 'RV',
};

const ACTION_CODE: Record<ActionType, string> = {
  fold: 'F',
  limp: 'L',
  call: 'C',
  raise: 'R',
  reraise: '3B',
  check: 'X',
  bet: 'B',
};

export default function PlayerRow({ player, street, onAction, onUndo }: Props) {
  const actions = street === 'preflop' ? PREFLOP_ACTIONS : POSTFLOP_ACTIONS;
  const history = player.actions
    .map((a) => `${STREET_CODE[a.street]}:${ACTION_CODE[a.type]}`)
    .join(' ');

  return (
    <View style={[styles.container, player.folded && styles.folded]}>
      <View style={styles.headerRow}>
        <Text style={styles.position}>{player.position}</Text>
        {!player.folded && (
          <Text style={styles.range}>
            推定 上位{player.rangeBand.top.toFixed(0)}〜{player.rangeBand.bottom.toFixed(0)}%
          </Text>
        )}
        {player.actions.length > 0 && (
          <Pressable onPress={onUndo} hitSlop={8}>
            <Text style={styles.undo}>元に戻す</Text>
          </Pressable>
        )}
      </View>
      {history.length > 0 && <Text style={styles.history}>{history}</Text>}
      {player.folded ? (
        <Text style={styles.foldedLabel}>フォールド済み</Text>
      ) : (
        <View style={styles.actionRow}>
          {actions.map((a) => (
            <Pressable key={a.type} onPress={() => onAction(a.type)} style={styles.actionButton}>
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  folded: {
    backgroundColor: '#f5f5f5',
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  position: { fontWeight: '700', fontSize: 14, color: '#222' },
  range: { fontSize: 11, color: '#777' },
  undo: { fontSize: 11, color: '#2f6fed' },
  history: { fontSize: 11, color: '#999', marginTop: 2 },
  foldedLabel: { fontSize: 12, color: '#aaa', marginTop: 4, fontStyle: 'italic' },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  actionButton: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#2f6fed' },
});
