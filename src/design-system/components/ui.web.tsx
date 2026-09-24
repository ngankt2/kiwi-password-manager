import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import { ArrowLeft, Check, ChevronDown, Eye, EyeOff, LockKeyhole, Shield, X, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../tokens';
import { useLayout } from '@/shared/hooks/use-layout';
import { useSession } from '@/shared/hooks/use-session';

export function T({ muted, mono, weight = 'regular', style, ...props }: TextProps & { muted?: boolean; mono?: boolean; weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  return <Text {...props} style={[s.text, { color: muted ? colors.secondary : colors.text, fontFamily: mono ? fonts.mono : fonts[weight], fontWeight: weight === 'regular' ? '400' : weight === 'medium' ? '500' : '600' }, style]} />;
}
export function Eyebrow({ children }: { children: ReactNode }) { return <T weight="bold" style={s.eyebrow}>{children}</T>; }

export function Button({ title, onPress, icon: Icon, variant = 'primary', loading, disabled, small, style, testID }: {
  title: string; onPress: () => void; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle; testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const foreground = variant === 'primary' ? 'var(--color-on-primary)' : variant === 'danger' ? colors.error : colors.text;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [s.button, { paddingHorizontal: small ? 10 : 14, minHeight: small ? 28 : 34,
      backgroundColor: variant === 'primary' ? (hovered ? colors.primaryHover : 'var(--color-primary-fill)') : variant === 'danger' ? colors.dangerMuted : hovered || pressed ? colors.elevated : 'transparent',
      borderColor: focused ? colors.primary : variant === 'secondary' ? colors.strong : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}>
    {loading ? <ActivityIndicator size="small" color={foreground} /> : Icon ? <Icon size={17} strokeWidth={2} color={foreground} /> : null}
    <T weight="medium" style={{ color: foreground, fontSize: 13 }}>{title}</T>
  </Pressable>;
}

export function IconButton({ icon: Icon, label, onPress, active, danger, disabled }: { icon: LucideIcon; label: string; onPress: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled}
    onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    style={({ pressed }) => [s.iconButton, { backgroundColor: hovered || pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
    <Icon size={19} strokeWidth={1.8} color={danger ? colors.error : active ? colors.primary : colors.secondary} />
  </Pressable>;
}

export function Input({ label, hint, error, secret, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string; secret?: boolean }) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 15_000);
    return () => clearTimeout(timer);
  }, [revealed]);
  return <View style={s.inputGroup}>
    <T weight="medium" style={s.label}>{label}</T>
    <View style={[s.inputWrap, { borderColor: error ? colors.error : focused ? colors.primary : colors.strong }]}>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} autoCapitalize={props.autoCapitalize ?? 'none'} autoCorrect={false}
        secureTextEntry={secret && !revealed} onFocus={(event) => { setFocused(true); props.onFocus?.(event); }} onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[s.input, props.multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, secret && { fontFamily: fonts.mono }, style]} />
      {secret && <IconButton icon={revealed ? EyeOff : Eye} label={t(revealed ? 'Ẩn {name}' : 'Hiện {name}', { name: label })} onPress={() => setRevealed(!revealed)} />}
    </View>
    {(hint || error) && <T style={[s.hint, { color: error ? colors.error : colors.secondary }]}>{error ?? hint}</T>}
  </View>;
}

export function Chip({ label, selected, onPress, icon: Icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={[s.chip, { minHeight: onPress ? 30 : 24, backgroundColor: selected ? colors.elevated : 'transparent', borderColor: selected ? colors.strong : colors.border }]}>
    {Icon && <Icon size={14} color={selected ? colors.primary : colors.secondary} />}
    <T style={{ fontSize: 12, color: selected ? colors.text : colors.secondary }} weight={selected ? 'semibold' : 'regular'}>{label}</T>
  </Pressable>;
}

export function Divider() { return <View style={s.divider} />; }
export function Logo({ small }: { small?: boolean }) {
  return <View style={s.logo}><View style={[s.logoMark, small && { width: 32, height: 36 }]}><Shield size={small ? 22 : 28} color={colors.primary} strokeWidth={1.8} /><View style={s.keyDot} /></View>
    <View><T weight="bold" style={{ fontSize: small ? 21 : 26, letterSpacing: -0.8 }}>Kiro</T>
      <T muted style={{ fontSize: small ? 8 : 10, letterSpacing: 1.2 }}>PASSWORD MANAGER</T></View>
  </View>;
}
export function StatusPill({ text = 'Local & encrypted' }: { text?: string }) { return <View style={s.statusPill}><View style={s.dot} /><T style={{ fontSize: 11, color: colors.secondary }}>{text}</T></View>; }

export function EmptyState({ icon: Icon = LockKeyhole, title, detail, action }: { icon?: LucideIcon; title: string; detail: string; action?: ReactNode }) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon size={29} color={colors.secondary} strokeWidth={1.3} /></View><T weight="semibold" style={{ fontSize: 14, textAlign: 'center' }}>{title}</T><T muted style={{ maxWidth: 320, textAlign: 'center', lineHeight: 22 }}>{detail}</T>{action}</View>;
}

export function Dialog({ open, title, description, onClose, children, footer }: { open: boolean; title: string; description?: string; onClose: () => void; children?: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  const { mobile } = useLayout(); const { settings } = useSession();
  return <Modal visible={open} transparent animationType={settings.reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
    <View style={[s.modalOverlay, mobile && { justifyContent: 'flex-end', padding: 0 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Đóng')} />
      <SafeAreaView edges={['bottom']} style={[s.dialog, mobile && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%' }]} accessibilityViewIsModal>
        <View style={s.dialogHeader}><T weight="bold" style={{ fontSize: 15, flex: 1 }}>{title}</T><IconButton icon={X} label={t('Đóng')} onPress={onClose} /></View>
        {description && <T muted style={{ marginBottom: 22, lineHeight: 22 }}>{description}</T>}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18 }}>{children}</ScrollView>
        {footer && <View style={s.dialogFooter}>{footer}</View>}
      </SafeAreaView>
    </View>
  </Modal>;
}

export function ToggleRow({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: value, disabled }} onPress={() => onChange(!value)} disabled={disabled} style={[s.settingRow, { opacity: disabled ? 0.45 : 1 }]}>
    <View style={{ flex: 1, gap: 4 }}><T weight="medium">{title}</T>{detail && <T muted style={{ fontSize: 12, lineHeight: 18 }}>{detail}</T>}</View>
    <View style={[s.toggle, { backgroundColor: value ? 'var(--color-primary-fill)' : colors.strong, alignItems: value ? 'flex-end' : 'flex-start' }]}><View style={s.toggleThumb}>{value && <Check size={10} color="var(--color-primary-fill)" />}</View></View>
  </Pressable>;
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={s.inputGroup}><T weight="medium" style={s.label}>{label}</T><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`} onPress={() => setOpen(true)} style={s.select}>
    <T style={{ flex: 1 }}>{options.find((option) => option.value === value)?.label ?? value}</T><ChevronDown size={17} color={colors.secondary} /></Pressable>
    <Dialog open={open} title={label} onClose={() => setOpen(false)}>{options.map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { onChange(option.value); setOpen(false); }} style={[s.selectOption, option.value === value && { backgroundColor: colors.elevated }]}><T style={{ flex: 1 }}>{option.label}</T>{option.value === value && <Check size={18} color={colors.primary} />}</Pressable>)}</Dialog>
  </View>;
}

export function PageHeader({ title, detail, onBack, right }: { title: string; detail?: string; onBack?: () => void; right?: ReactNode }) {
  const { t } = useI18n();
  return <View style={s.pageHeader}>{onBack && <IconButton icon={ArrowLeft} label={t('Quay lại')} onPress={onBack} />}<View style={{ flex: 1, gap: 4 }}><T weight="bold" style={{ fontSize: 21, letterSpacing: -0.21 }}>{title}</T>{detail && <T muted style={{ fontSize: 12 }}>{detail}</T>}</View>{right}</View>;
}

export const s = StyleSheet.create({
  text: { fontSize: 13, lineHeight: 20 }, eyebrow: { fontSize: 11, letterSpacing: 0.66, color: colors.secondary, lineHeight: 18 },
  button: { minHeight: 34, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  iconButton: { minWidth: 28, minHeight: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  inputGroup: { gap: 7 }, label: { color: 'var(--color-label)', fontSize: 12 }, hint: { fontSize: 11, lineHeight: 17 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 9, backgroundColor: colors.background, minHeight: 36 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 13, paddingHorizontal: 12, paddingVertical: 8, ...Platform.select({ web: { outlineWidth: 0 } }) },
  chip: { paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 }, logo: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  logoMark: { width: 37, height: 40, justifyContent: 'center', alignItems: 'center' }, keyDot: { position: 'absolute', width: 4, height: 7, backgroundColor: colors.primary, borderRadius: 3, top: 16 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 13, minHeight: 280 }, emptyIcon: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, height: 44, width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'var(--color-overlay)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.strong, borderRadius: 12, padding: 20 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 }, dialogFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 22, minHeight: 64, paddingVertical: 12 }, toggle: { width: 38, height: 22, borderRadius: 12, padding: 3, justifyContent: 'center' }, toggleThumb: { width: 16, height: 16, backgroundColor: '#FFFFFF', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  select: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 9, borderWidth: 1, borderColor: colors.strong },
  selectOption: { minHeight: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 8 }, pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20 },
});
