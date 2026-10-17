import { useI18n } from '@/shared/hooks/use-i18n';
import { localizedFieldLabel } from '@/shared/i18n/field-label';
import type { CustomField, ItemType } from '@/domain/entities/vault';

export const itemTypes: Record<ItemType, { label: string; icon: string; hue: number; chroma: number; tint: string }> = {
  login: { label: 'Đăng nhập', icon: 'key', hue: 262, chroma: 0.13, tint: '#0A84FF' },
  'secure-note': { label: 'Ghi chú bảo mật', icon: 'sticky_note_2', hue: 75, chroma: 0.12, tint: '#C9A227' },
  env: { label: 'Env', icon: 'code', hue: 155, chroma: 0.11, tint: '#28A745' },
  card: { label: 'Thẻ thanh toán', icon: 'credit_card', hue: 25, chroma: 0.13, tint: '#FF9F0A' },
  wifi: { label: 'Wi-Fi', icon: 'wifi', hue: 215, chroma: 0.12, tint: '#30B0C7' },
  'ssh-key': { label: 'SSH Key', icon: 'terminal', hue: 150, chroma: 0.12, tint: '#48484A' },
  'api-key': { label: 'API Key', icon: 'api', hue: 305, chroma: 0.13, tint: '#BF5AF2' },
  database: { label: 'Cơ sở dữ liệu', icon: 'database', hue: 195, chroma: 0.11, tint: '#5E5CE6' },
  server: { label: 'Máy chủ', icon: 'dns', hue: 235, chroma: 0.09, tint: '#32ADE6' },
  custom: { label: 'Tuỳ chỉnh', icon: 'tune', hue: 260, chroma: 0.01, tint: '#8E8E93' },
};

export function useLabels() {
  const { text, dateTime, shortDate, compactDateTime } = useI18n();
  return {
    itemTypes: Object.fromEntries(Object.entries(itemTypes).map(([key, value]) => [key, { ...value, label: text(value.label) }])) as typeof itemTypes,
    fieldLabel: (field: CustomField, type: ItemType) => localizedFieldLabel(field, type, text),
    dateTime, shortDate, compactDateTime,
  };
}
