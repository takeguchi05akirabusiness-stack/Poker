import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import CardSlot from '../components/CardSlot';
import { CPU_STRENGTHS, CpuStrength, decideCpuAction } from '../cpu/cpuDecision';
import {
  applyAction,
  BIG_BLIND,
  canRaise,
  HandState,
  minRaiseTotalFor,
  SeatId,
  startHand,
  toCallFor,
} from '../cpu/gameEngine';

type StrengthKey = keyof typeof CPU_STRENGTHS;

const STARTING_STACK = 100;

export default function CpuMatchScreen() {
  const [strengthKey, setStrengthKey] = useState<StrengthKey>('normal');
  const [matchStacks, setMatchStacks] = useState<[number, number] | null>(null);
  const [buttonIsHuman, setButtonIsHuman] = useState(true);
  const [hand, setHand] = useState<HandState | null>(null);
  const [cpuThinking, setCpuThinking] = useState(false);
  const [betAmount, setBetAmount] = useState(BIG_BLIND * 3);
  const [lastCpuNote, setLastCpuNote] = useState<string | null>(null);
  const processingRef = useRef(false);

  function startMatch() {
    setMatchStacks([STARTING_STACK, STARTING_STACK]);
    setButtonIsHuman(true);
    setHand(startHand([STARTING_STACK, STARTING_STACK], true));
    setLastCpuNote(null);
  }

  function resetMatch() {
    setMatchStacks(null);
    setHand(null);
  }

  function nextHand() {
    if (!matchStacks) return;
    const nextButton = !buttonIsHuman;
    setButtonIsHuman(nextButton);
    setHand(startHand(matchStacks, nextButton));
    setLastCpuNote(null);
  }

  // Settle a finished hand's result into the persistent match stacks (once).
  useEffect(() => {
    if (!hand || !hand.handOver || !hand.result || !matchStacks) return;
    const { winner, amountWon } = hand.result;
    const settled: [number, number] = [...hand.stacks] as [number, number];
    if (winner === 'split') {
      settled[0] += amountWon;
      settled[1] += amountWon;
    } else {
      settled[winner] += amountWon;
    }
    setMatchStacks(settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand?.handOver]);

  // Drive the CPU's turn via continual re-solving.
  useEffect(() => {
    if (!hand || hand.handOver || hand.toAct !== 1 || processingRef.current) return;
    processingRef.current = true;
    setCpuThinking(true);
    const strength: CpuStrength = CPU_STRENGTHS[strengthKey];
    decideCpuAction(hand, strength).then(({ action, strategy }) => {
      const label = strategy.actions
        .map((a, i) => `${a}:${(strategy.frequencies[i] * 100).toFixed(0)}%`)
        .join(' / ');
      setLastCpuNote(`CPUの検討: ${label || '(算出不可)'}`);
      setHand((prev) => (prev ? applyAction(prev, 1, action) : prev));
      setCpuThinking(false);
      processingRef.current = false;
    });
  }, [hand?.toAct, hand?.handOver, strengthKey]);

  if (!matchStacks || !hand) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>GTO CPU対戦(β)</Text>
        <Text style={styles.warning}>
          ヘッズアップ(1対1)専用です。CPUは行動のたびにその場でGTOソルバー(4-2)を簡易設定で再計算し、算出された混合戦略に従って行動します。実際のプレイをもとにした簡易ヒューリスティックで相手(あなた)のレンジを推定するため、崩したプレイをするとCPU側の想定も変化します。
        </Text>
        <Text style={styles.sectionLabel}>CPUの強さ</Text>
        <View style={styles.row}>
          {(Object.keys(CPU_STRENGTHS) as StrengthKey[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setStrengthKey(key)}
              style={[styles.pill, strengthKey === key && styles.pillActive]}
            >
              <Text style={[styles.pillText, strengthKey === key && styles.pillTextActive]}>
                {CPU_STRENGTHS[key].label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.primaryButton} onPress={startMatch}>
          <Text style={styles.primaryButtonText}>対戦開始({STARTING_STACK}BBスタート)</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const busted = matchStacks[0] <= 0 || matchStacks[1] <= 0;
  const toCall = toCallFor(hand, 0);
  const potNow = hand.potBB + hand.committedThisStreet[0] + hand.committedThisStreet[1];
  const humanCanRaise = canRaise(hand, 0);
  const minRaise = humanCanRaise ? minRaiseTotalFor(hand, 0) : 0;
  const maxRaise = hand.committedThisStreet[0] + hand.stacks[0];

  function act(type: 'fold' | 'check' | 'call' | 'bet') {
    if (!hand) return;
    if (type === 'bet') {
      const amount = Math.max(minRaise, Math.min(maxRaise, betAmount));
      setHand(applyAction(hand, 0, { type: toCall > 0 ? 'raise' : 'bet', amount }));
    } else {
      setHand(applyAction(hand, 0, { type }));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>GTO CPU対戦(β)</Text>
        <Pressable onPress={resetMatch}>
          <Text style={styles.resetLink}>マッチ終了</Text>
        </Pressable>
      </View>

      <View style={styles.stacksRow}>
        <StackBadge label="あなた" stack={hand.stacks[0] + hand.committedThisStreet[0]} isTurn={hand.toAct === 0 && !hand.handOver} />
        <View style={styles.potBadge}>
          <Text style={styles.potText}>ポット {potNow.toFixed(1)}BB</Text>
        </View>
        <StackBadge label="CPU" stack={hand.stacks[1] + hand.committedThisStreet[1]} isTurn={hand.toAct === 1 && !hand.handOver} />
      </View>

      <Text style={styles.sectionLabel}>ボード</Text>
      <View style={styles.cardRow}>
        {Array.from({ length: 5 }, (_, i) => (
          <CardSlot
            key={i}
            card={i < hand.board.length ? hand.board[i] : null}
            label={i < 3 ? `Flop${i + 1}` : i === 3 ? 'Turn' : 'River'}
            onPress={() => {}}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>あなたのハンド</Text>
      <View style={styles.cardRow}>
        <CardSlot card={hand.holeCards[0][0]} label="カード1" onPress={() => {}} />
        <CardSlot card={hand.holeCards[0][1]} label="カード2" onPress={() => {}} />
      </View>

      <Text style={styles.sectionLabel}>CPUのハンド</Text>
      <View style={styles.cardRow}>
        <CardSlot card={hand.revealCpuHand ? hand.holeCards[1][0] : null} label="カード1" onPress={() => {}} />
        <CardSlot card={hand.revealCpuHand ? hand.holeCards[1][1] : null} label="カード2" onPress={() => {}} />
      </View>

      {cpuThinking && (
        <View style={styles.thinkingBox}>
          <ActivityIndicator color="#2f6fed" />
          <Text style={styles.thinkingText}>CPU思考中(再計算中)…</Text>
        </View>
      )}
      {!!lastCpuNote && !cpuThinking && <Text style={styles.cpuNote}>{lastCpuNote}</Text>}

      {!hand.handOver && hand.toAct === 0 && (
        <View style={styles.actionBox}>
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={() => act('fold')}>
              <Text style={styles.actionButtonText}>フォールド</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => act(toCall > 0 ? 'call' : 'check')}>
              <Text style={styles.actionButtonText}>{toCall > 0 ? `コール(${toCall}BB)` : 'チェック'}</Text>
            </Pressable>
          </View>
          {humanCanRaise && (
            <>
              <View style={styles.stepperRow}>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => setBetAmount((v) => Math.max(minRaise, v - 1))}
                >
                  <Text style={styles.stepperButtonText}>-</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{betAmount.toFixed(1)}BB</Text>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => setBetAmount((v) => Math.min(maxRaise, v + 1))}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.presetRow}>
                <Pressable style={styles.presetButton} onPress={() => setBetAmount(Math.min(maxRaise, Math.round(potNow / 2)))}>
                  <Text style={styles.presetText}>1/2ポット</Text>
                </Pressable>
                <Pressable style={styles.presetButton} onPress={() => setBetAmount(Math.min(maxRaise, potNow))}>
                  <Text style={styles.presetText}>ポット</Text>
                </Pressable>
                <Pressable style={styles.presetButton} onPress={() => setBetAmount(maxRaise)}>
                  <Text style={styles.presetText}>オールイン</Text>
                </Pressable>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => act('bet')}>
                <Text style={styles.primaryButtonText}>{toCall > 0 ? 'レイズ' : 'ベット'}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {hand.handOver && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>
            {hand.result?.winner === 'split'
              ? '引き分け(チョップ)'
              : hand.result?.winner === 0
              ? 'あなたの勝ち'
              : 'CPUの勝ち'}
            {' '}({hand.result?.amountWon.toFixed(1)}BB) ・ {hand.result?.reason === 'fold' ? 'フォールド' : 'ショーダウン'}
          </Text>
          {busted ? (
            <View>
              <Text style={styles.resultText}>
                {matchStacks[0] <= 0 ? 'CPUの勝利でマッチ終了' : 'あなたの勝利でマッチ終了'}
              </Text>
              <Pressable style={styles.primaryButton} onPress={startMatch}>
                <Text style={styles.primaryButtonText}>マッチをリセット</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.primaryButton} onPress={nextHand}>
              <Text style={styles.primaryButtonText}>次のハンド</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function StackBadge({ label, stack, isTurn }: { label: string; stack: number; isTurn: boolean }) {
  return (
    <View style={[styles.stackBadge, isTurn && styles.stackBadgeActive]}>
      <Text style={styles.stackLabel}>{label}</Text>
      <Text style={styles.stackValue}>{stack.toFixed(1)}BB</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f9' },
  content: { padding: 14, paddingTop: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#111' },
  resetLink: { color: '#c02626', fontWeight: '700', fontSize: 12 },
  warning: {
    fontSize: 11,
    color: '#8a6d00',
    backgroundColor: '#fff7d6',
    padding: 8,
    borderRadius: 8,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#777',
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  pill: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#111827', borderColor: '#111827' },
  pillText: { fontSize: 13, fontWeight: '700', color: '#444' },
  pillTextActive: { color: '#fff' },
  primaryButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stacksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  stackBadge: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  stackBadgeActive: { borderColor: '#2f6fed', borderWidth: 2 },
  stackLabel: { fontSize: 11, color: '#888' },
  stackValue: { fontSize: 15, fontWeight: '800', color: '#111' },
  potBadge: { paddingHorizontal: 10, alignItems: 'center' },
  potText: { fontSize: 12, fontWeight: '700', color: '#555' },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  thinkingBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  thinkingText: { marginLeft: 8, color: '#555', fontSize: 12 },
  cpuNote: { fontSize: 10, color: '#999', marginBottom: 8 },
  actionBox: { marginTop: 8 },
  actionRow: { flexDirection: 'row', marginBottom: 8 },
  actionButton: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e5e9f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 18, fontWeight: '700', color: '#333' },
  stepperValue: { marginHorizontal: 12, fontSize: 15, fontWeight: '700', color: '#222', minWidth: 80 },
  presetRow: { flexDirection: 'row', marginBottom: 8 },
  presetButton: {
    backgroundColor: '#eceef2',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  presetText: { fontSize: 11, fontWeight: '700', color: '#444' },
  resultBox: { backgroundColor: '#eef2ff', borderRadius: 10, padding: 14, marginTop: 8 },
  resultText: { fontSize: 14, fontWeight: '700', color: '#222', marginBottom: 6 },
});
