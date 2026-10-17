import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, ChevronRight } from 'lucide-react-native';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { Eyebrow, PageHeader, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { useI18n } from '@/shared/hooks/use-i18n';
import { RELEASE_NOTES } from '@/features/about/release-notes';
import { SUPPORT_URL } from '@/features/about/privacy';
import { expo as appConfig } from '../../../app.json';
import { version as appVersion } from '../../../package.json';
import { AppShell } from './app-shell';

const APPKIRO_URL = `https://appkiro.com?utm_source=${encodeURIComponent(appConfig.name)}`;

export function AboutScreen() {
  const { t } = useI18n();
  return <AppShell>
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 660 }}>
        <PageHeader title={t('Giới thiệu')} onBack={() => router.replace('/settings')} />
        <View style={styles.hero}>
          <BrandSymbol size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <T weight="bold" style={{ fontSize: 22, letterSpacing: -0.3 }}>{appConfig.name}</T>
              <T weight="semibold" style={styles.version}>v{appVersion}</T>
            </View>
            <T muted style={{ fontSize: 15 }}>{t('Mật khẩu của bạn, an toàn trên thiết bị.')}</T>
          </View>
        </View>
        <T style={{ fontSize: 15, lineHeight: 21, marginBottom: 16 }}>{t('Một nơi an toàn cho mật khẩu, ghi chú bảo mật, thẻ thanh toán, khoá SSH, API key và biến môi trường. Kho được mã hoá bằng AES-256-GCM và Argon2id, chỉ lưu trên thiết bị của bạn, không cần tài khoản và không theo dõi.')}</T>
        <View style={[styles.group, { marginBottom: 28 }]}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(APPKIRO_URL)} style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.fill }]}>
            <T style={{ flex: 1, fontSize: 17, color: colors.primary }}>{t('Phát triển bởi {name}', { name: 'AppKiro' })}</T><ArrowUpRight size={17} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={({ pressed }) => [styles.linkRow, styles.separator, pressed && { backgroundColor: colors.fill }]}>
            <T style={{ flex: 1, fontSize: 17 }}>{t('Chính sách quyền riêng tư')}</T><ChevronRight size={17} color={colors.secondary} />
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(SUPPORT_URL)} style={({ pressed }) => [styles.linkRow, styles.separator, pressed && { backgroundColor: colors.fill }]}>
            <T style={{ flex: 1, fontSize: 17, color: colors.primary }}>{t('Liên hệ hỗ trợ')}</T><ArrowUpRight size={17} color={colors.primary} />
          </Pressable>
        </View>
        <Eyebrow>{t('Nhật ký phát hành')}</Eyebrow>
        <T muted style={{ fontSize: 13, paddingHorizontal: 4, marginTop: 2, marginBottom: 8 }}>{t('Theo dõi tính năng mới, cải tiến và cập nhật qua từng phiên bản.')}</T>
        <View style={styles.group}>
          {RELEASE_NOTES.map((release, index) => <View key={release.version} style={[styles.release, index > 0 && styles.separator]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T weight="semibold" style={{ fontSize: 17 }}>v{release.version}</T>
              {release.version === appVersion && <T weight="semibold" style={styles.badge}>{t('Mới nhất')}</T>}
            </View>
            {release.notes.map((note) => <View key={note} style={{ flexDirection: 'row', gap: 10 }}>
              <T muted style={{ fontSize: 15, lineHeight: 21 }}>•</T><T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{t(note)}</T>
            </View>)}
          </View>)}
        </View>
      </View>
    </ScrollView>
  </AppShell>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  version: { fontSize: 12, color: colors.secondary, backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: 8, overflow: 'hidden' },
  group: { backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' },
  linkRow: { minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  release: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  badge: { fontSize: 12, color: colors.primary, backgroundColor: colors.primaryMuted, borderRadius: 999, paddingHorizontal: 8, overflow: 'hidden' },
});
