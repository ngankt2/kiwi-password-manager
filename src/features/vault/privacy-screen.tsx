import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUpRight } from 'lucide-react-native';
import { Eyebrow, PageHeader, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { useI18n } from '@/shared/hooks/use-i18n';
import { PRIVACY_INTRO, PRIVACY_SECTIONS, SUPPORT_URL, privacyUpdatedDate } from '@/features/about/privacy';

// Lives outside the (vault) group so the policy stays readable while the vault is locked.
export function PrivacyScreen() {
  const { t, locale } = useI18n();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 660 }}>
        <PageHeader title={t('Chính sách quyền riêng tư')} detail={t('Cập nhật lần cuối: {date}', { date: privacyUpdatedDate(locale) })}
          onBack={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <T style={styles.paragraph}>{t(PRIVACY_INTRO)}</T>
        {PRIVACY_SECTIONS.map((section) => <View key={section.title} style={{ marginTop: 20 }}>
          <Eyebrow>{t(section.title)}</Eyebrow>
          <View style={styles.group}>{section.paragraphs.map((paragraph) => <T key={paragraph} style={styles.paragraph}>{t(paragraph)}</T>)}</View>
        </View>)}
        <View style={[styles.group, { marginTop: 28, paddingVertical: 0 }]}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(SUPPORT_URL)} style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.fill }]}>
            <T style={{ flex: 1, fontSize: 17, color: colors.primary }}>{t('Liên hệ hỗ trợ')}</T><ArrowUpRight size={17} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 6, marginTop: 6 },
  paragraph: { fontSize: 15, lineHeight: 21, paddingVertical: 8 },
  linkRow: { minHeight: 50, marginHorizontal: -16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
