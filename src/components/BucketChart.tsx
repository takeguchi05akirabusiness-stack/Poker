import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionFrequencies } from '../solver/solve';

interface Props {
  bars: { bucket: number; strategy: ActionFrequencies | null }[];
  numBuckets: number;
}

function colorForAction(label: string): string {
  if (label === 'fold') return '#9aa4b2';
  if (label === 'check' || label === 'call') return '#3b82f6';
  if (label === 'allin') return '#991b1b';
  if (label.startsWith('bet') || label.startsWith('raise')) return '#f97316';
  return '#999';
}

export default function BucketChart({ bars, numBuckets }: Props) {
  return (
    <View>
      {bars.map(({ bucket, strategy }) => (
        <View key={bucket} style={styles.row}>
          <Text style={styles.label}>
            バケット {bucket + 1}/{numBuckets}
            {bucket === 0 ? '(弱)' : bucket === numBuckets - 1 ? '(強)' : ''}
          </Text>
          <View style={styles.bar}>
            {strategy ? (
              strategy.actions.map((a, i) =>
                strategy.frequencies[i] > 0.001 ? (
                  <View
                    key={a}
                    style={{ flex: strategy.frequencies[i], backgroundColor: colorForAction(a) }}
                  />
                ) : null
              )
            ) : (
              <View style={{ flex: 1, backgroundColor: '#e5e7eb' }} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 6 },
  label: { fontSize: 11, color: '#555', marginBottom: 2 },
  bar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
});
