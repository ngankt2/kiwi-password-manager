import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Pencil } from 'lucide-react-native';
import { Button, Dialog, Input, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { getItemColor, getItemIcon, isItemColor, ITEM_COLORS, ITEM_ICON_IDS, randomItemColor, withItemColor, withItemIcon, type ItemIconId } from '@/domain/entities/item-icon';
import type { ItemSnapshot } from '@/domain/entities/vault';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useIconImage } from '@/shared/hooks/use-icon-image';
import { BRAND_ICONS } from '@/shared/brand-icons';
import { ICON_IMAGE_ERRORS } from '@/shared/icon-image-message';
import { ITEM_ICON_OPTIONS } from '@/shared/item-icons';
import { ItemIcon } from './item-icon';

export function ItemIconPicker({ item, onChange, folder = false, website, onBusyChange }: { item: Pick<ItemSnapshot, 'type' | 'metadata'>; onChange: (metadata: ItemSnapshot['metadata']) => void; folder?: boolean; website?: string; onBusyChange?: (busy: boolean) => void }) {
  const { t, text } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'icons' | 'brands' | 'url'>('icons');
  const [imageUrl, setImageUrl] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const remote = useIconImage({ metadata: item.metadata, website, onChange, onBusyChange });
  const brands = BRAND_ICONS.filter((brand) => brand.label.toLowerCase().includes(brandSearch.toLowerCase().trim()));
  const selected = getItemIcon(item.metadata);
  const selectedColor = getItemColor(item.metadata);
  const [draft, setDraft] = useState({ color: selectedColor, hex: selectedColor ?? '' });
  const hex = draft.color === selectedColor ? draft.hex : selectedColor ?? '';
  const setHex = (value: string) => setDraft({ color: selectedColor, hex: value });
  const label = t(folder ? 'Đổi biểu tượng thư mục' : 'Đổi biểu tượng');
  const chooseColor = (color: string | null) => onChange(withItemColor(item.metadata, color));
  const choose = (icon: ItemIconId | null) => {
    remote.cancel();
    onChange(withItemIcon(item.metadata, icon));
    setOpen(false);
  };
  const close = () => { if (remote.busy && !remote.automatic) remote.cancel(); setOpen(false); };
  return <>
    <View style={{ alignItems: 'center', gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}>
      <ItemIcon type={item.type} metadata={item.metadata} folder={folder} large />
      <View style={{ position: 'absolute', right: -3, bottom: -3, padding: 5, borderRadius: 10, backgroundColor: colors.elevated }}><Pencil size={12} color={colors.text} /></View>
    </Pressable>
    {remote.busy && <Button title={t('Huỷ tải ảnh')} variant="ghost" small onPress={remote.cancel} />}
    </View>
    <Dialog open={open} title={label} description={t('Chọn biểu tượng và màu. Thay đổi được áp dụng khi lưu.')} onClose={close}
      footer={<Button title={t('Dùng biểu tượng mặc định')} variant="secondary" onPress={() => choose(null)} />}>
      <T weight="semibold">{t('Màu biểu tượng')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {ITEM_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={t('Màu {color}', { color })} accessibilityState={{ selected: selectedColor === color }} onPress={() => chooseColor(color)}
          style={{ width: 44, height: 44, padding: 5, borderWidth: 2, borderRadius: 10, borderColor: selectedColor === color ? colors.primary : 'transparent' }}><View style={{ flex: 1, borderRadius: 5, backgroundColor: color }} /></Pressable>)}
      </View>
      <Input label={t('Mã màu HEX')} value={hex} onChangeText={(value) => { setHex(value); if (isItemColor(value)) chooseColor(value); }}
        onBlur={() => setHex(selectedColor ?? '')} placeholder="#86EFAC" maxLength={7} autoCapitalize="characters" autoCorrect={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title={t('Màu ngẫu nhiên')} variant="secondary" small onPress={() => chooseColor(randomItemColor())} /><Button title={t('Dùng màu mặc định')} variant="ghost" small onPress={() => chooseColor(null)} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['icons', 'brands', 'url'] as const).map((source) => <Button key={source} title={t(source === 'icons' ? 'Biểu tượng' : source === 'brands' ? 'Logo thương hiệu' : 'Ảnh từ URL')} small variant={tab === source ? 'primary' : 'secondary'} onPress={() => setTab(source)} />)}
      </View>
      {tab === 'icons' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ITEM_ICON_IDS.map((id) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={text(ITEM_ICON_OPTIONS[id].label)} accessibilityState={{ selected: !remote.image && selected === id }} onPress={() => choose(id)}
          style={({ pressed }) => ({ padding: 4, borderWidth: 2, borderRadius: 14, borderColor: !remote.image && selected === id ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 })}>
          <ItemIcon type={item.type} icon={id} metadata={item.metadata} folder={folder} />
        </Pressable>)}
      </View>}
      {tab === 'brands' && <>
        <Input label={t('Tìm logo')} value={brandSearch} onChangeText={setBrandSearch} placeholder="Google, WeChat, HSBC…" autoCorrect={false} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {brands.map((brand) => <Pressable key={brand.id} accessibilityRole="button" accessibilityLabel={brand.label} accessibilityState={{ selected: remote.image?.brand === brand.id }} onPress={() => { remote.chooseBrand(brand); setOpen(false); }}
            style={({ pressed }) => ({ width: 96, minHeight: 88, gap: 6, padding: 5, alignItems: 'center', borderWidth: 2, borderRadius: 12, borderColor: remote.image?.brand === brand.id ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 })}>
            <View style={{ backgroundColor: brand.background, borderRadius: 10, padding: 7 }}><Image source={{ uri: brand.dataUri }} cachePolicy="none" contentFit="contain" style={{ width: 30, height: 30 }} /></View>
            <T style={{ fontSize: 11.5, lineHeight: 16, textAlign: 'center' }} numberOfLines={2}>{brand.label}</T>
          </Pressable>)}
        </View>
        {!brands.length && <T muted>{t('Không tìm thấy logo.')}</T>}
      </>}
      {tab === 'url' && <View style={{ gap: 12 }}>
        {remote.image && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ItemIcon type={item.type} metadata={item.metadata} folder={folder} /><T>{t('Ảnh đã lưu')}</T></View>}
        <Input label={t('URL ảnh icon')} value={imageUrl} onChangeText={(value) => { if (remote.busy && !remote.automatic) remote.cancel(); setImageUrl(value); }} placeholder="https://example.com/logo.png" maxLength={4096} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
        <Button title={t('Tải và dùng ảnh')} disabled={!imageUrl.trim()} loading={remote.busy && !remote.automatic} onPress={() => remote.loadUrl(imageUrl)} />
        <Button title={t('Lấy favicon từ website')} variant="secondary" disabled={!remote.origin || remote.busy} onPress={remote.loadWebsite} />
        <T muted style={{ fontSize: 12 }}>{remote.origin ?? t('Nhập website trong mục để lấy favicon.')}</T>
        {remote.busy && <><T muted>{t('Đang tải icon…')}</T><Button title={t('Huỷ tải ảnh')} small variant="ghost" onPress={remote.cancel} /></>}
        {remote.error && <T style={{ color: colors.error }} accessibilityRole="alert">{t(ICON_IMAGE_ERRORS[remote.error])}</T>}
        <T muted style={{ fontSize: 12 }}>{t('Ảnh được lưu trong kho mã hoá và giữ nguyên đến khi bạn đổi biểu tượng.')}</T>
      </View>}
    </Dialog>
  </>;
}
