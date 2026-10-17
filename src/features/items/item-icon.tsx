import { View } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Briefcase, Cloud, Code, CreditCard, Database, FileKey2, Folder, Gamepad2, Globe, GraduationCap, Heart, KeyRound, Landmark, LockKeyhole, Mail, Plane, Server, Shield, ShoppingBag, SlidersHorizontal, Smartphone, Star, StickyNote, Terminal, User, Wifi, type LucideIcon } from 'lucide-react-native';
import type { ItemSnapshot, ItemType } from '@/domain/entities/vault';
import { getItemColor, getItemIcon, getItemIconImage, iconForeground, type ItemIconId } from '@/domain/entities/item-icon';

export const TYPE_ICONS: Record<ItemType, LucideIcon> = { login: Globe, 'secure-note': StickyNote, env: Code, 'api-key': KeyRound, 'ssh-key': Terminal, database: Database, server: Server, wifi: Wifi, card: CreditCard, custom: FileKey2 };
// Apple system colors with a white glyph, as in the Passwords app.
const palette: Record<ItemType, [string, string]> = { login: ['#0A84FF', '#FFFFFF'], 'secure-note': ['#C9A227', '#FFFFFF'], env: ['#28A745', '#FFFFFF'], 'api-key': ['#BF5AF2', '#FFFFFF'], 'ssh-key': ['#48484A', '#FFFFFF'], database: ['#5E5CE6', '#FFFFFF'], server: ['#32ADE6', '#FFFFFF'], wifi: ['#30B0C7', '#FFFFFF'], card: ['#FF9F0A', '#FFFFFF'], custom: ['#8E8E93', '#FFFFFF'] };
const icons: Record<ItemIconId, LucideIcon> = { key: KeyRound, globe: Globe, mail: Mail, shield: Shield, lock: LockKeyhole, briefcase: Briefcase, user: User, 'credit-card': CreditCard, bank: Landmark, 'shopping-bag': ShoppingBag, cloud: Cloud, code: Code, terminal: Terminal, database: Database, server: Server, wifi: Wifi, smartphone: Smartphone, gamepad: Gamepad2, note: StickyNote, heart: Heart, 'graduation-cap': GraduationCap, plane: Plane, star: Star, settings: SlidersHorizontal, folder: Folder };
export function ItemIcon({ type, large, metadata, icon, folder = false, size }: { type: ItemType; large?: boolean; metadata?: ItemSnapshot['metadata']; icon?: ItemIconId; folder?: boolean; size?: number }) {
  const selected = icon ?? getItemIcon(metadata);
  const Icon = selected ? icons[selected] : folder ? Folder : TYPE_ICONS[type];
  const image = icon === undefined ? getItemIconImage(metadata) : null;
  const pickedColor = getItemColor(metadata) ?? image?.background;
  const [backgroundColor, color] = pickedColor ? [pickedColor, iconForeground(pickedColor)] : folder ? ['#0A84FF', '#FFFFFF'] : palette[type];
  const dimension = size ?? (large ? 64 : 40);
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={{ width: dimension, height: dimension, borderRadius: Math.round(dimension * 0.24), alignItems: 'center', justifyContent: 'center', backgroundColor }} accessibilityElementsHidden>
    {image && failed !== image.dataUri ? <Image source={{ uri: image.dataUri }} recyclingKey={image.dataUri} cachePolicy="none" autoplay={false} contentFit="contain" style={{ width: dimension * 0.78, height: dimension * 0.78 }} onError={() => setFailed(image.dataUri)} />
      : <Icon size={Math.round(dimension * 0.48)} color={color} strokeWidth={2} />}
  </View>;
}
