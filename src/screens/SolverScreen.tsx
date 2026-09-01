import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../poker/types';
import { cardKey } from '../poker/cards';
import { combosForBand } from '../poker/ranges';
import CardSlot from '../components/CardSlot';
import CardPicker from '../components/CardPicker';
import RangeGrid from '../components/RangeGrid';
import BucketChart from '../components/BucketChart';
import { PublicNode } from '../solver/cfr';
import {
  bucketStrategiesForNode,
  rangeGridForNode,
  SolveResult,
  solveSpot,
  strategyForHand,
} from '../solver/solve';
import {
  BetAbstraction,
  defaultBetAbstraction,
  HoldemWorld,
  SpotConfig,
  Street,
  wideBetAbstraction,
} from '../solver/types';

const STREETS: { key: Street; label: string; boardCount: number }[] = [
  { key: 'preflop', label: 'プリフロップ', boardCount: 0 },
  { key: 'flop', label: 'フロップ', boardCount: 3 },
  { key: 'turn', label: 'ターン', boardCount: 4 },
  { key: 'river', label: 'リバー', boardCount: 5 },
];

type ActiveSlot = { kind: 'board'; index: number } | { kind: 'query'; index: 0 | 1 } | null;

function boardCountFor(street: Street): number {
  return STREETS.find((s) => s.key === street)!.boardCount;
}

export default function SolverScreen() {
  const [numPlayers, setNumPlayers] = useState(2);
  const [effectiveStackBB, setEffectiveStackBB] = useState(100);
  const [potBB, setPotBB] = useState(6);
  const [startStreet, setStartStreet] = useState<Street>('preflop');
  const [board, setBoard] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [rangePercents, setRangePercents] = useState<number[]>([100, 100]);
  const [sizingPreset, setSizingPreset] = useState<'simple' | 'wide'>('simple');
  const [numBuckets, setNumBuckets] = useState(6);
  const [iterations, setIterations] = useState(3000);

  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);
  const [queryCards, setQueryCards] = useState<(Card | null)[]>([null, null]);

  const [solving, setSolving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [path, setPath] = useState<number[]>([]);

  function changeNumPlayers(delta: number) {
    const next = Math.max(2, Math.min(6, numPlayers + delta));
    setNumPlayers(next);
    setRangePercents((prev) => {
      const arr = prev.slice(0, next);
      while (arr.length < next) arr.push(100);
      return arr;
    });
  }

  function changeStreet(street: Street) {
    setStartStreet(street);
    setBoard([null, null, null, null, null]);
  }

  const usedBoardCards = useMemo(
    () => new Set(board.filter((c): c is Card => c !== null).map(cardKey)),
    [board]
  );

  const boardFilled = board.slice(0, boardCountFor(startStreet)).every((c) => c !== null);

  const currentNode: PublicNode<HoldemWorld> | null = useMemo(() => {
    if (!result) return null;
    let node: PublicNode<HoldemWorld> = result.root;
    for (const idx of path) {
      if (node.type !== 'decision') break;
      node = node.children[idx];
    }
    return node;
  }, [result, path]);

  const currentMeta = result && currentNode?.type === 'decision' ? result.meta.get(currentNode.id) : null;
  const isAtSpotStreet = result && currentMeta && currentMeta.street === result.config.startStreet;

  async function handleSolve() {
    const boardCards = board.slice(0, boardCountFor(startStreet)).filter((c): c is Card => c !== null);
    const betAbstraction: BetAbstraction = sizingPreset === 'simple' ? defaultBetAbstraction() : wideBetAbstraction();
    const config: SpotConfig = {
      numPlayers,
      actingOrder: Array.from({ length: numPlayers }, (_, i) => i),
      effectiveStackBB,
      potBB,
      startStreet,
      board: boardCards,
      ranges: rangePercents.map((pct) => combosForBand({ top: 0, bottom: pct })),
      betAbstraction,
      numBuckets,
      postflopTrials: 10,
    };
    setSolving(true);
    setProgress({ done: 0, total: iterations });
    setResult(null);
    setPath([]);
    const solved = await solveSpot(config, iterations, (done, total) => setProgress({ done, total }));
    setResult(solved);
    setSolving(false);
  }

  function reset() {
    setResult(null);
    setPath([]);
    setQueryCards([null, null]);
  }

  const usedForQueryPicker = new Set(usedBoardCards);
  const activeSlotCard: Card | null =
    activeSlot?.kind === 'board'
      ? board[activeSlot.index]
      : activeSlot?.kind === 'query'
      ? queryCards[activeSlot.index]
      : null;
  if (activeSlotCard) usedForQueryPicker.delete(cardKey(activeSlotCard));
  queryCards.forEach((c) => {
    if (c && (!activeSlotCard || cardKey(c) !== cardKey(activeSlotCard))) usedForQueryPicker.add(cardKey(c));
  });

  function selectCard(card: Card) {
    if (!activeSlot) return;
    if (activeSlot.kind === 'board') {
      setBoard((prev) => {
        const next = [...prev];
        next[activeSlot.index] = card;
        return next;
      });
      const boardIndices = Array.from({ length: boardCountFor(startStreet) }, (_, i) => i);
      const next = boardIndices.find((i) => i > activeSlot.index && board[i] === null);
      setActiveSlot(next !== undefined ? { kind: 'board', index: next } : null);
    } else {
      setQueryCards((prev) => {
        const next = [...prev];
        next[activeSlot.index] = card;
        return next;
      });
      if (activeSlot.index === 0 && !queryCards[1]) {
        setActiveSlot({ kind: 'query', index: 1 });
      } else {
        setActiveSlot(null);
      }
    }
  }

  const queryHand =
    queryCards[0] && queryCards[1] ? ([queryCards[0], queryCards[1]] as [Card, Card]) : null;

  const exactStrategy =
    result && currentNode && queryHand && isAtSpotStreet
      ? strategyForHand(result, currentNode, queryHand, result.config.startStreet, result.config.board)
      : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>GTOソルバー(β)</Text>
      <Text style={styles.warning}>
        簡易的な抽象化(ベットサイズ・手札バケット限定)によるCFR近似計算です。3人以上の場合、理論上の均衡(ナッシュ均衡)は保証されません。参考値としてご利用ください。
      </Text>

      {!result && !solving && (
        <>
          <Text style={styles.sectionLabel}>人数</Text>
          <View style={styles.stepperRow}>
            <StepperButton onPress={() => changeNumPlayers(-1)} label="-" />
            <Text style={styles.stepperValue}>{numPlayers}人</Text>
            <StepperButton onPress={() => changeNumPlayers(1)} label="+" />
            {numPlayers >= 3 && <Text style={styles.hint}>3人以上は計算が重くなります</Text>}
          </View>

          <Text style={styles.sectionLabel}>開始ストリート</Text>
          <View style={styles.streetTabs}>
            {STREETS.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => changeStreet(s.key)}
                style={[styles.streetTab, startStreet === s.key && styles.streetTabActive]}
              >
                <Text style={[styles.streetTabText, startStreet === s.key && styles.streetTabTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {boardCountFor(startStreet) > 0 && (
            <>
              <Text style={styles.sectionLabel}>ボード</Text>
              <View style={styles.cardRow}>
                {Array.from({ length: boardCountFor(startStreet) }, (_, i) => (
                  <CardSlot
                    key={i}
                    card={board[i]}
                    label={`カード${i + 1}`}
                    active={activeSlot?.kind === 'board' && activeSlot.index === i}
                    onPress={() => setActiveSlot({ kind: 'board', index: i })}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>実効スタック(BB) / ポット(BB)</Text>
          <View style={styles.stepperRow}>
            <StepperButton onPress={() => setEffectiveStackBB((v) => Math.max(2, v - 5))} label="-" />
            <Text style={styles.stepperValue}>スタック {effectiveStackBB}BB</Text>
            <StepperButton onPress={() => setEffectiveStackBB((v) => v + 5)} label="+" />
          </View>
          <View style={styles.stepperRow}>
            <StepperButton onPress={() => setPotBB((v) => Math.max(1, v - 1))} label="-" />
            <Text style={styles.stepperValue}>ポット {potBB}BB</Text>
            <StepperButton onPress={() => setPotBB((v) => v + 1)} label="+" />
          </View>

          <Text style={styles.sectionLabel}>各プレイヤーのレンジ(上位X%)</Text>
          {rangePercents.map((pct, i) => (
            <View key={i} style={styles.stepperRow}>
              <Text style={styles.playerLabel}>P{i + 1}</Text>
              <StepperButton
                onPress={() =>
                  setRangePercents((prev) => prev.map((v, idx) => (idx === i ? Math.max(5, v - 5) : v)))
                }
                label="-"
              />
              <Text style={styles.stepperValue}>上位{pct}%</Text>
              <StepperButton
                onPress={() =>
                  setRangePercents((prev) => prev.map((v, idx) => (idx === i ? Math.min(100, v + 5) : v)))
                }
                label="+"
              />
            </View>
          ))}

          <Text style={styles.sectionLabel}>ベットサイズ設定</Text>
          <View style={styles.streetTabs}>
            <Pressable
              onPress={() => setSizingPreset('simple')}
              style={[styles.streetTab, sizingPreset === 'simple' && styles.streetTabActive]}
            >
              <Text style={[styles.streetTabText, sizingPreset === 'simple' && styles.streetTabTextActive]}>
                シンプル(1サイズ・速い)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSizingPreset('wide')}
              style={[styles.streetTab, sizingPreset === 'wide' && styles.streetTabActive]}
            >
              <Text style={[styles.streetTabText, sizingPreset === 'wide' && styles.streetTabTextActive]}>
                やや広い(2サイズ・遅い)
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>手札バケット数 / 反復回数</Text>
          <View style={styles.stepperRow}>
            <StepperButton onPress={() => setNumBuckets((v) => Math.max(3, v - 1))} label="-" />
            <Text style={styles.stepperValue}>{numBuckets}段階</Text>
            <StepperButton onPress={() => setNumBuckets((v) => Math.min(12, v + 1))} label="+" />
          </View>
          <View style={styles.stepperRow}>
            <StepperButton onPress={() => setIterations((v) => Math.max(500, v - 500))} label="-" />
            <Text style={styles.stepperValue}>{iterations}回</Text>
            <StepperButton onPress={() => setIterations((v) => v + 500)} label="+" />
          </View>

          <Pressable
            style={[styles.solveButton, !boardFilled && styles.solveButtonDisabled]}
            disabled={!boardFilled}
            onPress={handleSolve}
          >
            <Text style={styles.solveButtonText}>ソルブ開始</Text>
          </Pressable>

          {activeSlot?.kind === 'board' && (
            <CardPicker usedCards={usedBoardCards} onSelect={selectCard} onClose={() => setActiveSlot(null)} />
          )}
        </>
      )}

      {solving && (
        <View style={styles.solvingBox}>
          <ActivityIndicator size="large" color="#2f6fed" />
          <Text style={styles.solvingText}>
            計算中… {progress ? `${progress.done}/${progress.total}` : ''}
          </Text>
        </View>
      )}

      {result && currentNode && (
        <View>
          <Pressable style={styles.newSolveButton} onPress={reset}>
            <Text style={styles.newSolveButtonText}>新しいスポットを設定</Text>
          </Pressable>

          <View style={styles.breadcrumbRow}>
            <Pressable onPress={() => setPath([])} disabled={path.length === 0}>
              <Text style={[styles.breadcrumbText, path.length === 0 && styles.breadcrumbDisabled]}>最初に戻る</Text>
            </Pressable>
            <Pressable onPress={() => setPath((p) => p.slice(0, -1))} disabled={path.length === 0}>
              <Text style={[styles.breadcrumbText, path.length === 0 && styles.breadcrumbDisabled]}>一つ戻る</Text>
            </Pressable>
          </View>

          {currentNode.type === 'terminal' ? (
            <View style={styles.terminalBox}>
              <Text style={styles.terminalText}>このハンドは終了しました(フォールドまたはショーダウン)</Text>
            </View>
          ) : (
            <>
              <Text style={styles.nodeHeader}>
                手番: プレイヤー{currentNode.player + 1} ・ {STREETS.find((s) => s.key === currentMeta?.street)?.label}
              </Text>

              {!isAtSpotStreet && (
                <Text style={styles.hint}>
                  ※このストリートはランダムなボード展開の平均です。手札バケット別の戦略を表示します。
                </Text>
              )}

              <Text style={styles.sectionLabel}>アクション(タップで進む)</Text>
              <View style={styles.actionRow}>
                {currentNode.actions.map((a, i) => (
                  <Pressable key={a} style={styles.navButton} onPress={() => setPath((p) => [...p, i])}>
                    <Text style={styles.navButtonText}>{a}</Text>
                  </Pressable>
                ))}
              </View>

              {isAtSpotStreet && (
                <>
                  <Text style={styles.sectionLabel}>実際のハンドを指定(任意)</Text>
                  <View style={styles.cardRow}>
                    {[0, 1].map((i) => (
                      <CardSlot
                        key={i}
                        card={queryCards[i]}
                        label={`カード${i + 1}`}
                        active={activeSlot?.kind === 'query' && activeSlot.index === i}
                        onPress={() => setActiveSlot({ kind: 'query', index: i as 0 | 1 })}
                      />
                    ))}
                  </View>
                  {activeSlot?.kind === 'query' && (
                    <CardPicker
                      usedCards={usedForQueryPicker}
                      onSelect={selectCard}
                      onClose={() => setActiveSlot(null)}
                    />
                  )}
                  {exactStrategy && (
                    <View style={styles.exactBox}>
                      <Text style={styles.exactTitle}>推奨アクション</Text>
                      {exactStrategy.actions.map((a, i) => (
                        <Text key={a} style={styles.exactLine}>
                          {a}: {(exactStrategy.frequencies[i] * 100).toFixed(1)}%
                        </Text>
                      ))}
                    </View>
                  )}

                  <Text style={styles.sectionLabel}>レンジ表(プレイヤー{currentNode.player + 1})</Text>
                  <RangeGrid
                    entries={rangeGridForNode(result, currentNode, currentMeta!.street, result.config.board)}
                    highlight={
                      queryHand
                        ? {
                            high: (Math.max(queryHand[0].rank, queryHand[1].rank)) as Card['rank'],
                            low: (Math.min(queryHand[0].rank, queryHand[1].rank)) as Card['rank'],
                            suited: queryHand[0].suit === queryHand[1].suit,
                          }
                        : null
                    }
                  />
                </>
              )}

              {!isAtSpotStreet && (
                <BucketChart bars={bucketStrategiesForNode(result, currentNode)} numBuckets={result.config.numBuckets} />
              )}
            </>
          )}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function StepperButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable style={styles.stepperButton} onPress={onPress}>
      <Text style={styles.stepperButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f9' },
  content: { padding: 14, paddingTop: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8 },
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
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e9f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 16, fontWeight: '700', color: '#333' },
  stepperValue: { marginHorizontal: 10, fontSize: 13, fontWeight: '700', color: '#222', minWidth: 90 },
  playerLabel: { width: 30, fontWeight: '700', color: '#444' },
  hint: { fontSize: 11, color: '#c07800', marginLeft: 6 },
  streetTabs: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  streetTab: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#eceef2',
    marginRight: 6,
    marginBottom: 6,
    borderRadius: 8,
  },
  streetTabActive: { backgroundColor: '#111827' },
  streetTabText: { fontSize: 11, fontWeight: '700', color: '#666' },
  streetTabTextActive: { color: '#fff' },
  cardRow: { flexDirection: 'row', marginBottom: 8, flexWrap: 'wrap' },
  solveButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  solveButtonDisabled: { backgroundColor: '#aab8d6' },
  solveButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  solvingBox: { alignItems: 'center', paddingVertical: 30 },
  solvingText: { marginTop: 10, color: '#555' },
  newSolveButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#eceef2',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  newSolveButtonText: { fontSize: 12, fontWeight: '700', color: '#333' },
  breadcrumbRow: { flexDirection: 'row', marginBottom: 8 },
  breadcrumbText: { fontSize: 12, color: '#2f6fed', fontWeight: '700', marginRight: 16 },
  breadcrumbDisabled: { color: '#bbb' },
  terminalBox: { padding: 16, backgroundColor: '#eef2ff', borderRadius: 10 },
  terminalText: { color: '#333', fontSize: 13 },
  nodeHeader: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  navButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  navButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  exactBox: { backgroundColor: '#101317', borderRadius: 10, padding: 10, marginBottom: 10 },
  exactTitle: { color: '#9aa4b2', fontSize: 11, marginBottom: 4 },
  exactLine: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
