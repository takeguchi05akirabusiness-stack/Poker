import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Suit } from '../poker/types';
import { RANKS, RANK_LABELS, SUITS, SUIT_SYMBOLS, cardKey } from '../poker/cards';

interface Props {
  usedCards: Set<string>;
  onSelect: (card: Card) => void;
  onClose: () => void;
}

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.floor((width - 32 - 4 * 13) / 13);

export default function CardPicker({ usedCards, onSelect, onClose }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>カードを選択</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>閉じる</Text>
        </Pressable>
      </View>
      {SUITS.map((suit) => (
        <View key={suit} style={styles.row}>
          {RANKS.map((rank) => {
            const card: Card = { rank, suit };
            const key = cardKey(card);
            const disabled = usedCards.has(key);
            const isRed = suit === 'H' || suit === 'D';
            return (
              <Pressable
                key={key}
                disabled={disabled}
                onPress={() => onSelect(card)}
                style={[
                  styles.cell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  disabled && styles.cellDisabled,
                ]}
              >
                <Text style={[styles.cellText, isRed ? styles.red : styles.black, disabled && styles.textDisabled]}>
                  {RANK_LABELS[rank]}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.suitSymbol}>{SUIT_SYMBOLS[suit]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f2f2f5',
    borderRadius: 12,
    padding: 8,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  title: { fontWeight: '700', fontSize: 13, color: '#333' },
  close: { color: '#2f6fed', fontWeight: '600', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  cell: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  cellDisabled: {
    backgroundColor: '#e5e5e5',
    borderColor: '#e5e5e5',
  },
  cellText: { fontSize: 12, fontWeight: '700' },
  textDisabled: { color: '#bbb' },
  red: { color: '#d33' },
  black: { color: '#222' },
  suitSymbol: { width: 16, textAlign: 'center', fontSize: 14, marginLeft: 2 },
});
