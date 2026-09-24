import { useEffect, useState } from 'react';
import { Platform, Text, ScrollView } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as SplashScreen from 'expo-splash-screen';
import { NativeFilePort } from '@/infrastructure/filesystem/native';
import fixtures from '../../fixtures/native-poc.json';
import { runNativeSuite, type NativeResult } from './suite';

// Keep test files in their own subtree, including on a device with existing vaults.
const prefix = 'native-qa/';
class TestFiles extends NativeFilePort {
  override read(path: string) { return super.read(prefix + path); }
  override writeNew(path: string, bytes: Uint8Array) { return super.writeNew(prefix + path, bytes); }
  override promote(from: string, to: string) { return super.promote(prefix + from, prefix + to); }
  override remove(path: string) { return super.remove(prefix + path); }
  override async list(path: string) { return (await super.list(prefix + path)).map((file) => file.slice(prefix.length)); }
}

let execution: Promise<string> | undefined;
async function execute() {
  const startedAt = new Date().toISOString();
  const environment = { os: Platform.OS, version: Platform.Version, reactNative: Platform.constants.reactNativeVersion };
  const file = new File(Paths.document, 'native-test-results.json');
  const write = (report: object) => { const json = JSON.stringify(report, null, 2); file.write(json); return json; };
  const progress = (results: NativeResult[]) => write({ startedAt, environment, completed: false, results });
  progress([]);
  try {
    const report = await runNativeSuite(new TestFiles(), fixtures, progress);
    return write({ startedAt, finishedAt: new Date().toISOString(), environment, completed: true,
      passed: report.results.filter((result) => result.passed).length,
      failed: report.results.filter((result) => !result.passed).length, ...report });
  } catch (error) {
    return write({ startedAt, environment, completed: false, fatal: error instanceof Error ? error.message : 'UNEXPECTED' });
  }
}

export default function NativeTests() {
  const [status, setStatus] = useState('Running native tests with dummy data…');
  useEffect(() => {
    void SplashScreen.hideAsync();
    execution ??= execute();
    let mounted = true;
    void execution.then((report) => { if (mounted) setStatus(report); });
    return () => { mounted = false; };
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, backgroundColor: '#121212', flexGrow: 1 }}>
    <Text selectable style={{ color: '#FFFFFF', fontSize: 14 }}>{status}</Text>
  </ScrollView>;
}
