import { useI18n } from '@/shared/hooks/use-i18n';
import { localizedFieldLabel } from '@/shared/i18n/field-label';
import type { CustomField, ItemType } from '@/domain/entities/vault';

export const itemTypes: Record<ItemType, { label: string; icon: string; hue: number; chroma: number }> = {
  login: { label: 'Đăng nhập', icon: 'key', hue: 262, chroma: 0.13 },
  'secure-note': { label: 'Ghi chú bảo mật', icon: 'sticky_note_2', hue: 75, chroma: 0.12 },
  env: { label: 'Env', icon: 'code', hue: 155, chroma: 0.11 },
  card: { label: 'Thẻ thanh toán', icon: 'credit_card', hue: 25, chroma: 0.13 },
  wifi: { label: 'Wi-Fi', icon: 'wifi', hue: 215, chroma: 0.12 },
  'ssh-key': { label: 'SSH Key', icon: 'terminal', hue: 150, chroma: 0.12 },
  'api-key': { label: 'API Key', icon: 'api', hue: 305, chroma: 0.13 },
  database: { label: 'Cơ sở dữ liệu', icon: 'database', hue: 195, chroma: 0.11 },
  server: { label: 'Máy chủ', icon: 'dns', hue: 235, chroma: 0.09 },
  custom: { label: 'Tuỳ chỉnh', icon: 'tune', hue: 260, chroma: 0.01 },
};

export function useLabels() {
  const { text, dateTime, shortDate, compactDateTime } = useI18n();
  return {
    itemTypes: Object.fromEntries(Object.entries(itemTypes).map(([key, value]) => [key, { ...value, label: text(value.label) }])) as typeof itemTypes,
    fieldLabel: (field: CustomField, type: ItemType) => localizedFieldLabel(field, type, text),
    dateTime, shortDate, compactDateTime,
  };
}
