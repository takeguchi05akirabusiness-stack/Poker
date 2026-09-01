import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import HandScreen from './src/screens/HandScreen';
import SolverScreen from './src/screens/SolverScreen';
import CpuMatchScreen from './src/screens/CpuMatchScreen';

type Tab = 'equity' | 'solver' | 'cpu';

export default function App() {
  const [tab, setTab] = useState<Tab>('equity');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, tab === 'equity' && styles.tabActive]} onPress={() => setTab('equity')}>
          <Text style={[styles.tabText, tab === 'equity' && styles.tabTextActive]}>勝率予測</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'solver' && styles.tabActive]} onPress={() => setTab('solver')}>
          <Text style={[styles.tabText, tab === 'solver' && styles.tabTextActive]}>GTOソルバー</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'cpu' && styles.tabActive]} onPress={() => setTab('cpu')}>
          <Text style={[styles.tabText, tab === 'cpu' && styles.tabTextActive]}>CPU対戦</Text>
        </Pressable>
      </View>
      {tab === 'equity' ? <HandScreen /> : tab === 'solver' ? <SolverScreen /> : <CpuMatchScreen />}
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f9',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingTop: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#2f6fed',
  },
  tabText: { color: '#9aa4b2', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
});
