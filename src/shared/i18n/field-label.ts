import type { CustomField, ItemType } from '@/domain/entities/vault';
import { fieldsForType } from '@/domain/entities/templates';

/** A user's custom label must never be interpreted as an application message. */
export function localizedFieldLabel(field: CustomField, type: ItemType, localize: (text: string) => string) {
  const template = fieldsForType(type).find((entry) => entry.id === field.id);
  return template && template.label === field.label ? localize(template.label) : field.label;
}
