import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { AlertCircle, CheckCircle2, X } from 'lucide-react-native';
import { useSession } from '@/shared/hooks/use-session';
import { session } from '@/infrastructure/session';
import { colors } from '../tokens';
import { T } from './ui';

export function Toast() {
  const { notice, error } = useSession();
  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(notice);
    const timer = setTimeout(() => session.notify(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice && !error) return null;
  return <View pointerEvents="box-none" style={styles.position}><View style={[styles.toast, error && { borderColor: colors.error }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
    {error ? <AlertCircle size={20} color={colors.errorText} /> : <CheckCircle2 size={20} color={colors.success} />}
    <T weight="medium" style={{ flex: 1, fontSize: 15, lineHeight: 20 }}>{error ?? notice}</T>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => { session.notify(null); session.clearError(); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><X size={15} color={colors.secondary} /></Pressable>
  </View></View>;
}
const styles = StyleSheet.create({ position: { position: 'absolute', bottom: 90, left: 16, right: 16, alignItems: 'center', zIndex: 100 }, toast: { maxWidth: 480, borderRadius: 999, paddingLeft: 18, paddingRight: 4, paddingVertical: 2, backgroundColor: colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 10, flexDirection: 'row', alignItems: 'center', boxShadow: '0 8px 18px rgba(0,0,0,0.35)' } });
