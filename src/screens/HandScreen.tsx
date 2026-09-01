import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useHandSession, Street } from '../state/useHandSession';
import CardSlot from '../components/CardSlot';
import CardPicker from '../components/CardPicker';
import EquityMeter from '../components/EquityMeter';
import PlayerRow from '../components/PlayerRow';
import { Card } from '../poker/types';
import { cardKey } from '../poker/cards';

type ActiveSlot = { kind: 'hero'; index: 0 | 1 } | { kind: 'board'; index: number } | null;

const STREET_TABS: { key: Street; label: string; boardCount: number }[] = [
  { key: 'preflop', label: 'プリフロップ', boardCount: 0 },
  { key: 'flop', label: 'フロップ', boardCount: 3 },
  { key: 'turn', label: 'ターン', boardCount: 4 },
  { key: 'river', label: 'リバー', boardCount: 5 },
];

export default function HandScreen() {
  const session = useHandSession();
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);

  const currentTab = STREET_TABS.find((t) => t.key === session.street)!;
  const visibleBoardIndices = Array.from({ length: currentTab.boardCount }, (_, i) => i);

  const activeSlotCard: Card | null =
    activeSlot?.kind === 'hero'
      ? session.heroCards[activeSlot.index]
      : activeSlot?.kind === 'board'
      ? session.board[activeSlot.index]
      : null;

  const usedCardsForPicker = new Set(session.usedCards);
  if (activeSlotCard) usedCardsForPicker.delete(cardKey(activeSlotCard));

  function selectCard(card: Card) {
    if (!activeSlot) return;
    if (activeSlot.kind === 'hero') {
      session.setHeroCard(activeSlot.index, card);
      if (activeSlot.index === 0 && !session.heroCards[1]) {
        setActiveSlot({ kind: 'hero', index: 1 });
        return;
      }
    } else {
      session.setBoardCard(activeSlot.index, card);
      const next = visibleBoardIndices.find(
        (i) => i > activeSlot.index && session.board[i] === null
      );
      if (next !== undefined) {
        setActiveSlot({ kind: 'board', index: next });
        return;
      }
    }
    setActiveSlot(null);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ポーカー勝率予測ツール</Text>

      <View style={styles.controlsRow}>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperButton}
            onPress={() => session.setTableSize(session.tableSize - 1)}
          >
            <Text style={styles.stepperButtonText}>-</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{session.tableSize}人</Text>
          <Pressable
            style={styles.stepperButton}
            onPress={() => session.setTableSize(session.tableSize + 1)}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.newHandButton}
          onPress={() => {
            session.newHand();
            setActiveSlot(null);
          }}
        >
          <Text style={styles.newHandText}>ニューハンド</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>あなたの座席</Text>
      <View style={styles.seatRow}>
        {session.players.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => session.setHeroSeat(i)}
            style={[styles.seatChip, p.isHero && styles.seatChipActive]}
          >
            <Text style={[styles.seatChipText, p.isHero && styles.seatChipTextActive]}>
              {p.position}
            </Text>
          </Pressable>
        ))}
      </View>

      <EquityMeter equity={session.equity} opponentCount={session.activeOpponents.length} />

      <Text style={styles.sectionLabel}>あなたのハンド</Text>
      <View style={styles.cardRow}>
        {[0, 1].map((i) => (
          <CardSlot
            key={i}
            card={session.heroCards[i]}
            label={`カード${i + 1}`}
            active={activeSlot?.kind === 'hero' && activeSlot.index === i}
            onPress={() => setActiveSlot({ kind: 'hero', index: i as 0 | 1 })}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>ストリート</Text>
      <View style={styles.streetTabs}>
        {STREET_TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => session.advanceStreet(t.key)}
            style={[styles.streetTab, session.street === t.key && styles.streetTabActive]}
          >
            <Text
              style={[
                styles.streetTabText,
                session.street === t.key && styles.streetTabTextActive,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {currentTab.boardCount > 0 && (
        <>
          <Text style={styles.sectionLabel}>コミュニティカード</Text>
          <View style={styles.cardRow}>
            {visibleBoardIndices.map((i) => (
              <CardSlot
                key={i}
                card={session.board[i]}
                label={i < 3 ? `Flop${i + 1}` : i === 3 ? 'Turn' : 'River'}
                active={activeSlot?.kind === 'board' && activeSlot.index === i}
                onPress={() => setActiveSlot({ kind: 'board', index: i })}
              />
            ))}
          </View>
        </>
      )}

      {activeSlot && (
        <CardPicker
          usedCards={usedCardsForPicker}
          onSelect={selectCard}
          onClose={() => setActiveSlot(null)}
        />
      )}

      <Text style={styles.sectionLabel}>相手プレイヤー</Text>
      {session.players
        .filter((p) => !p.isHero)
        .map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            street={session.street}
            onAction={(type) => session.recordAction(p.id, type)}
            onUndo={() => session.undoLastAction(p.id)}
          />
        ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f9' },
  content: { padding: 14, paddingTop: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 12 },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e5e9f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 18, fontWeight: '700', color: '#333' },
  stepperValue: { marginHorizontal: 10, fontSize: 15, fontWeight: '700', color: '#222' },
  newHandButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  newHandText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#777',
    marginTop: 4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  seatRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  seatChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  seatChipActive: { backgroundColor: '#2f6fed', borderColor: '#2f6fed' },
  seatChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  seatChipTextActive: { color: '#fff' },
  cardRow: { flexDirection: 'row', marginBottom: 12 },
  streetTabs: { flexDirection: 'row', marginBottom: 10 },
  streetTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#eceef2',
    marginRight: 4,
    borderRadius: 8,
  },
  streetTabActive: { backgroundColor: '#111827' },
  streetTabText: { fontSize: 11, fontWeight: '700', color: '#666' },
  streetTabTextActive: { color: '#fff' },
});
