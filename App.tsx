import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import HandScreen from './src/screens/HandScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <HandScreen />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f9',
  },
});
