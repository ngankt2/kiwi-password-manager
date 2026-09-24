import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { PageHeader } from '@/design-system/components/ui';
import { AppShell } from '@/features/vault/app-shell';

export function ToolLayout({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <AppShell><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60, alignItems: 'center' }}>
    <View style={{ width: '100%', maxWidth: 760, gap: 20 }}><PageHeader title={title} detail={detail} onBack={() => router.canGoBack() ? router.back() : router.replace('/settings')} />{children}</View>
  </ScrollView></AppShell>;
}
