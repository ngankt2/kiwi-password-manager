import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import { ArrowLeft, Check, ChevronDown, Eye, EyeOff, LockKeyhole, Star, X, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, weights } from '../tokens';
import { useLayout } from '@/shared/hooks/use-layout';
import { useSession } from '@/shared/hooks/use-session';
import { BrandSymbol } from './brand-symbol';

export function T({ muted, mono, weight = 'regular', style, ...props }: TextProps & { muted?: boolean; mono?: boolean; weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  return <Text {...props} style={[s.text, { color: muted ? colors.secondary : colors.text, fontFamily: mono ? fonts.mono : fonts[weight], fontWeight: weights[weight] }, style]} />;
}
/** Grouped-list section header (iOS style, sentence case is applied by the caller). */
export function Eyebrow({ children }: { children: ReactNode }) { return <T weight="semibold" style={s.eyebrow}>{children}</T>; }

export function Button({ title, onPress, icon: Icon, variant = 'primary', loading, disabled, small, style, testID }: {
  title: string; onPress: () => void; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle; testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const foreground = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.errorText : variant === 'ghost' ? colors.primary : colors.text;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [s.button, { paddingHorizontal: small ? 14 : 20, minHeight: small ? 36 : 50,
      backgroundColor: variant === 'primary' ? (hovered ? colors.primaryHover : colors.primary) : variant === 'danger' ? colors.dangerMuted : variant === 'secondary' ? (hovered || pressed ? colors.fillHover : colors.fill) : hovered || pressed ? colors.fill : 'transparent',
      borderColor: focused ? colors.primary : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}>
    {loading ? <ActivityIndicator size="small" color={foreground} /> : Icon ? <Icon size={small ? 16 : 18} strokeWidth={2} color={foreground} /> : null}
    <T weight="semibold" style={{ color: foreground, fontSize: small ? 15 : 17 }}>{title}</T>
  </Pressable>;
}

export function IconButton({ icon: Icon, label, onPress, active, danger, disabled }: { icon: LucideIcon; label: string; onPress: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled}
    onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    style={({ pressed }) => [s.iconButton, { backgroundColor: hovered || pressed ? colors.fill : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
    <Icon size={20} strokeWidth={1.9} color={danger ? colors.errorText : active && Icon === Star ? colors.favorite : active ? colors.primary : colors.secondary} fill={active && Icon === Star ? colors.favorite : 'none'} />
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
    <T style={s.label}>{label}</T>
    <View style={[s.inputWrap, { borderColor: error ? colors.error : focused ? colors.primary : 'transparent' }]}>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} selectionColor={colors.primary} autoCapitalize={props.autoCapitalize ?? 'none'} autoCorrect={false}
        secureTextEntry={secret && !revealed} onFocus={(event) => { setFocused(true); props.onFocus?.(event); }} onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[s.input, props.multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, secret && { fontFamily: fonts.mono }, style]} />
      {secret && <IconButton icon={revealed ? EyeOff : Eye} label={t(revealed ? 'Ẩn {name}' : 'Hiện {name}', { name: label })} onPress={() => setRevealed(!revealed)} />}
    </View>
    {(hint || error) && <T style={[s.hint, { color: error ? colors.errorText : colors.secondary }]}>{error ?? hint}</T>}
  </View>;
}

export function Chip({ label, selected, onPress, icon: Icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={[s.chip, { minHeight: onPress ? 36 : 26, backgroundColor: selected ? colors.primary : colors.fill }]}>
    {Icon && <Icon size={14} color={selected ? colors.onPrimary : colors.secondary} />}
    <T style={{ fontSize: 14, color: selected ? colors.onPrimary : colors.text }} weight={selected ? 'semibold' : 'regular'}>{label}</T>
  </Pressable>;
}

export function Divider() { return <View style={s.divider} />; }
export function Logo({ small }: { small?: boolean }) {
  return <View style={s.logo}><BrandSymbol size={small ? 36 : 48} />
    <View><T weight="bold" style={{ fontSize: small ? 20 : 26, letterSpacing: -0.4 }}>Kiro</T>
      <T muted style={{ fontSize: small ? 11 : 13 }}>Password Manager</T></View>
  </View>;
}
export function StatusPill({ text = 'Local & encrypted' }: { text?: string }) { return <View style={s.statusPill}><View style={s.dot} /><T style={{ fontSize: 12, color: colors.secondary }}>{text}</T></View>; }

export function EmptyState({ icon: Icon = LockKeyhole, title, detail, action }: { icon?: LucideIcon; title: string; detail: string; action?: ReactNode }) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon size={30} color={colors.secondary} strokeWidth={1.5} /></View><T weight="bold" style={{ fontSize: 22, textAlign: 'center', letterSpacing: -0.3 }}>{title}</T><T muted style={{ maxWidth: 320, textAlign: 'center', lineHeight: 21, fontSize: 15 }}>{detail}</T>{action}</View>;
}

export function Dialog({ open, title, description, onClose, children, footer }: { open: boolean; title: string; description?: string; onClose: () => void; children?: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  const { mobile } = useLayout(); const { settings } = useSession();
  return <Modal visible={open} transparent animationType={settings.reduceMotion ? 'none' : mobile ? 'slide' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
    <View style={[s.modalOverlay, mobile && { justifyContent: 'flex-end', padding: 0 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Đóng')} />
      <SafeAreaView edges={['bottom']} style={[s.dialog, mobile && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%', paddingTop: 8 }]} accessibilityViewIsModal>
        {mobile && <View style={s.grabber} />}
        <View style={s.dialogHeader}><T weight="bold" style={{ fontSize: 20, flex: 1, letterSpacing: -0.3 }}>{title}</T><Pressable accessibilityRole="button" accessibilityLabel={t('Đóng')} onPress={onClose} style={s.closeButton}><X size={16} strokeWidth={2.4} color={colors.secondary} /></Pressable></View>
        {description && <T muted style={{ marginBottom: 20, lineHeight: 21, fontSize: 15 }}>{description}</T>}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>{children}</ScrollView>
        {footer && <View style={s.dialogFooter}>{footer}</View>}
      </SafeAreaView>
    </View>
  </Modal>;
}

export function ToggleRow({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: value, disabled }} onPress={() => onChange(!value)} disabled={disabled} style={[s.settingRow, { opacity: disabled ? 0.45 : 1 }]}>
    <View style={{ flex: 1, gap: 3 }}><T style={{ fontSize: 17 }}>{title}</T>{detail && <T muted style={{ fontSize: 13, lineHeight: 18 }}>{detail}</T>}</View>
    <View style={[s.toggle, { backgroundColor: value ? colors.success : colors.fill, alignItems: value ? 'flex-end' : 'flex-start' }]}><View style={s.toggleThumb} /></View>
  </Pressable>;
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={s.inputGroup}><T style={s.label}>{label}</T><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`} onPress={() => setOpen(true)} style={s.select}>
    <T style={{ flex: 1, fontSize: 17 }}>{options.find((option) => option.value === value)?.label ?? value}</T><ChevronDown size={17} color={colors.secondary} /></Pressable>
    <Dialog open={open} title={label} onClose={() => setOpen(false)}><View style={s.group}>{options.map((option, index) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }} style={[s.selectOption, index > 0 && s.separator]}><T style={{ flex: 1, fontSize: 17 }}>{option.label}</T>{option.value === value && <Check size={18} strokeWidth={2.4} color={colors.primary} />}</Pressable>)}</View></Dialog>
  </View>;
}

export function PageHeader({ title, detail, onBack, right }: { title: string; detail?: string; onBack?: () => void; right?: ReactNode }) {
  const { t } = useI18n();
  return <View style={s.pageHeader}>{onBack && <IconButton icon={ArrowLeft} label={t('Quay lại')} onPress={onBack} />}<View style={{ flex: 1, gap: 2 }}><T weight="bold" style={{ fontSize: 34, lineHeight: 41, letterSpacing: 0.4 }}>{title}</T>{detail && <T muted style={{ fontSize: 15 }}>{detail}</T>}</View>{right}</View>;
}

export const s = StyleSheet.create({
  text: { fontSize: 17, lineHeight: 22 }, eyebrow: { fontSize: 13, color: colors.secondary, lineHeight: 18, paddingHorizontal: 4 },
  button: { borderRadius: 999, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  iconButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inputGroup: { gap: 7 }, label: { color: colors.secondary, fontSize: 13, paddingHorizontal: 4 }, hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, minHeight: 50 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 17, paddingHorizontal: 16, paddingVertical: 12, ...Platform.select({ web: { outlineWidth: 0 } }) },
  chip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 20 }, logo: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, minHeight: 280 }, emptyIcon: { backgroundColor: colors.surface, height: 64, width: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 510, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: 26, padding: 22 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.strong, marginBottom: 12 },
  closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 }, dialogFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingVertical: 10 }, toggle: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: 'center' }, toggleThumb: { width: 27, height: 27, backgroundColor: '#FFFFFF', borderRadius: 14, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
  select: { minHeight: 50, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12 },
  group: { backgroundColor: colors.elevated, borderRadius: 12, overflow: 'hidden' }, separator: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  selectOption: { minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
});
