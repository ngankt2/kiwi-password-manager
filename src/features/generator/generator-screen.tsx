import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { PageHeader } from '@/design-system/components/ui';
import { AppShell } from '@/features/vault/app-shell';
import { GeneratorPanel } from './generator-panel';

export function GeneratorScreen() {
  return <AppShell>
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 660 }}>
        <PageHeader title="Password generator" detail="Strong passwords, made effortlessly." onBack={() => router.replace('/vault')} />
        <GeneratorPanel />
      </View>
    </ScrollView>
  </AppShell>;
}
