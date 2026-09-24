import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Eye, EyeOff, ScanEye } from 'lucide-react-native';
import { IconButton, T } from '@/design-system/components/ui';
import { colors, fonts } from '@/design-system/tokens';
import { useI18n } from '@/shared/hooks/use-i18n';
import type { PasswordInputState } from '@/shared/hooks/use-password-input';

export function UnlockPasswordInput({ value, busy, onSubmit }: { value: PasswordInputState; busy: boolean; onSubmit: () => void }) {
  const { t } = useI18n();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return <View style={styles.group}>
    <T weight="medium" style={styles.label}>{t('Master Password')}</T>
    <View style={[styles.field, { borderColor: focused ? colors.primary : colors.strong }]}>
      <TextInput ref={input} accessibilityLabel={t('Master Password')} value={value.password} onChangeText={value.setPassword}
        secureTextEntry={!value.full} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="current-password"
        placeholder={t('Master Password')} placeholderTextColor={colors.muted} editable={!busy}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onSubmitEditing={onSubmit} returnKeyType="go" style={styles.input} />
      <IconButton icon={ScanEye} label={value.partial ? t('Đổi vị trí che mật khẩu') : t('Hiện một phần mật khẩu')} active={value.partial} disabled={!value.password || busy}
        onPress={() => { value.revealPartial(); input.current?.focus(); }} />
      <IconButton icon={value.full ? EyeOff : Eye} label={value.full ? t('Ẩn mật khẩu') : t('Hiện toàn bộ mật khẩu')} active={value.full} disabled={!value.password || busy}
        onPress={() => { value.toggleFull(); input.current?.focus(); }} />
    </View>
    {value.partial && <View style={styles.preview} accessibilityLabel={t('Mật khẩu hiện một phần')}>
      <View style={styles.heading}><ScanEye size={15} color={colors.primary} /><T style={styles.caption}>{t('Xem một phần')}</T></View>
      <ScrollView style={styles.previewScroll} keyboardShouldPersistTaps="handled">
        <T mono selectable={false} style={styles.previewValue}>{value.preview}</T>
      </ScrollView>
      <T muted style={styles.hint}>{t('{count} ký tự được che · Tự ẩn sau 15 giây', { count: value.maskedCount })}</T>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 }, label: { fontSize: 12 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 9, backgroundColor: colors.surface, minHeight: 48 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.mono, fontSize: 14, paddingHorizontal: 13, paddingVertical: 11 },
  preview: { gap: 9, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, caption: { fontSize: 11, color: colors.primary },
  previewScroll: { maxHeight: 144 }, previewValue: { fontSize: 14, lineHeight: 24, writingDirection: 'ltr' }, hint: { fontSize: 11, lineHeight: 17 },
});
