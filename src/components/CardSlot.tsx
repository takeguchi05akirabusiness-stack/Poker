import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../poker/types';
import { cardLabel } from '../poker/cards';

interface Props {
  card: Card | null;
  label: string;
  active?: boolean;
  onPress: () => void;
}

export default function CardSlot({ card, label, active, onPress }: Props) {
  const isRed = card?.suit === 'H' || card?.suit === 'D';
  return (
    <Pressable
      onPress={onPress}
      style={[styles.slot, active && styles.slotActive, card && styles.slotFilled]}
    >
      <Text style={[styles.cardText, card && (isRed ? styles.red : styles.black)]}>
        {card ? cardLabel(card) : '?'}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 52,
    height: 64,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  slotFilled: {
    borderColor: '#999',
  },
  slotActive: {
    borderColor: '#2f6fed',
    borderWidth: 3,
  },
  cardText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
  },
  red: { color: '#d33' },
  black: { color: '#222' },
  label: {
    fontSize: 9,
    color: '#888',
    marginTop: 2,
  },
});
