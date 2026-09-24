import { useEffect, useId, useState } from 'react';
import { getItemColor, getItemIcon, ITEM_COLORS, ITEM_ICON_IDS, randomItemColor, withItemColor, withItemIcon, type ItemIconId } from '@/domain/entities/item-icon';
import type { ItemSnapshot } from '@/domain/entities/vault';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useIconImage } from '@/shared/hooks/use-icon-image';
import { BRAND_ICONS } from '@/shared/brand-icons';
import { ICON_IMAGE_ERRORS } from '@/shared/icon-image-message';
import { ITEM_ICON_OPTIONS } from '@/shared/item-icons';
import { Button, Dialog, Icon, IconButton, Input, ItemTile } from './ui';

export function ItemIconPicker({ item, onChange, folder = false, openOnMount = false, website, onBusyChange }: { item: Pick<ItemSnapshot, 'type' | 'metadata'>; onChange: (metadata: ItemSnapshot['metadata']) => void; folder?: boolean; openOnMount?: boolean; website?: string; onBusyChange?: (busy: boolean) => void }) {
  const { t, text } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'icons' | 'brands' | 'url'>('icons');
  const [imageUrl, setImageUrl] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const remote = useIconImage({ metadata: item.metadata, website, onChange, onBusyChange });
  const brands = BRAND_ICONS.filter((brand) => brand.label.toLowerCase().includes(brandSearch.toLowerCase().trim()));
  useEffect(() => {
    if (!openOnMount) return;
    // Open above the containing folder dialog after it enters the top layer.
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [openOnMount]);
  const selected = getItemIcon(item.metadata);
  const selectedColor = getItemColor(item.metadata);
  const colorId = useId();
  const label = t(folder ? 'Đổi biểu tượng thư mục' : 'Đổi biểu tượng');
  const chooseColor = (color: string | null) => onChange(withItemColor(item.metadata, color));
  const choose = (icon: ItemIconId | null) => {
    remote.cancel();
    onChange(withItemIcon(item.metadata, icon));
    setOpen(false);
  };
  const close = () => { if (remote.busy && !remote.automatic) remote.cancel(); setOpen(false); };
  return <>
    <div className="desktop-item-icon-control">
    <button type="button" className={'desktop-item-icon-trigger' + (folder ? ' with-label' : '')} title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="desktop-item-icon-preview"><ItemTile type={item.type} metadata={item.metadata} folder={folder} size={44} /><span className="desktop-item-icon-edit"><Icon name="edit" size={11} /></span></span>
      {folder && <><span className="desktop-item-icon-label">{t('Biểu tượng và màu')}</span><Icon name="expand_more" size={16} /></>}
    </button>
    {remote.busy && <div className="desktop-icon-loading" role="status"><button type="button" title={t('Đang tải icon…')} onClick={() => { setTab('url'); setOpen(true); }}><span className="desktop-spinner" /></button><IconButton icon="close" label={t('Huỷ tải ảnh')} onClick={remote.cancel} /></div>}
    </div>
    <Dialog open={open} className="desktop-item-icon-dialog" title={label} description={t('Chọn biểu tượng và màu. Thay đổi được áp dụng khi lưu.')} onClose={close}
      footer={<><Button icon="restart_alt" onClick={() => choose(null)}>{t('Dùng biểu tượng mặc định')}</Button><Button variant="primary" onClick={close}>{t('Đóng')}</Button></>}>
      <div className="desktop-icon-colors">
        <label htmlFor={colorId}>{t('Màu biểu tượng')}</label>
        <div className="desktop-color-swatches" role="group" aria-label={t('Màu biểu tượng')}>
          {ITEM_COLORS.map((color) => <button type="button" key={color} className="desktop-color-swatch" style={{ '--swatch-color': color } as React.CSSProperties}
            aria-label={t('Màu {color}', { color })} title={color} aria-pressed={selectedColor === color} onClick={() => chooseColor(color)} />)}
        </div>
        <div className="desktop-color-custom">
          <input id={colorId} type="color" aria-label={t('Chọn màu')} value={selectedColor ?? ITEM_COLORS[0]} onChange={(event) => chooseColor(event.target.value)} />
          <span className="mono">{selectedColor ?? '—'}</span>
          <Button small variant="ghost" icon="shuffle" onClick={() => chooseColor(randomItemColor())}>{t('Màu ngẫu nhiên')}</Button>
          <Button small variant="ghost" onClick={() => chooseColor(null)}>{t('Dùng màu mặc định')}</Button>
        </div>
      </div>
      <div className="desktop-icon-source-tabs" role="group" aria-label={t('Kiểu biểu tượng')}>
        {(['icons', 'brands', 'url'] as const).map((source) => <button key={source} type="button" aria-pressed={tab === source} onClick={() => setTab(source)}>{t(source === 'icons' ? 'Biểu tượng' : source === 'brands' ? 'Logo thương hiệu' : 'Ảnh từ URL')}</button>)}
      </div>
      {tab === 'icons' && <div className="desktop-item-icon-grid" role="group" aria-label={t('Biểu tượng')} onKeyDown={(event) => {
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
        if (!(event.key in moves) && !['Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (current < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + moves[event.key] + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {ITEM_ICON_IDS.map((id, index) => <button key={id} type="button" className="desktop-item-icon-option" aria-label={text(ITEM_ICON_OPTIONS[id].label)} title={text(ITEM_ICON_OPTIONS[id].label)} aria-pressed={!remote.image && selected === id}
          data-dialog-autofocus={!remote.image && selected === id || !selected && index === 0 || undefined} onClick={() => choose(id)}>
          <ItemTile type={item.type} icon={id} metadata={item.metadata} folder={folder} size={40} />
        </button>)}
      </div>}
      {tab === 'brands' && <div className="desktop-brand-picker">
        <Input label={t('Tìm logo')} value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} placeholder="Google, WeChat, HSBC…" autoComplete="off" onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} />
        <div className="desktop-brand-grid" role="group" aria-label={t('Logo thương hiệu')}>
          {brands.map((brand) => <button type="button" key={brand.id} className="desktop-brand-option" aria-label={brand.label} aria-pressed={remote.image?.brand === brand.id} onClick={() => { remote.chooseBrand(brand); setOpen(false); }}>
            <span style={{ background: brand.background }}><img src={brand.dataUri} alt="" width={32} height={32} draggable={false} /></span><span>{brand.label}</span>
          </button>)}
        </div>
        {!brands.length && <span className="muted">{t('Không tìm thấy logo.')}</span>}
      </div>}
      {tab === 'url' && <div className="desktop-icon-url">
        {remote.image && <div className="desktop-icon-saved"><ItemTile type={item.type} metadata={item.metadata} folder={folder} size={48} /><span>{t('Ảnh đã lưu')}</span></div>}
        <Input label={t('URL ảnh icon')} value={imageUrl} onChange={(event) => { if (remote.busy && !remote.automatic) remote.cancel(); setImageUrl(event.target.value); }} placeholder="https://example.com/logo.png" maxLength={4096} autoComplete="off" spellCheck={false}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (imageUrl.trim()) remote.loadUrl(imageUrl); } }} />
        <Button icon="download" disabled={!imageUrl.trim()} busy={remote.busy && !remote.automatic} onClick={() => remote.loadUrl(imageUrl)}>{t('Tải và dùng ảnh')}</Button>
        <div className="desktop-icon-website"><Button icon="language" disabled={!remote.origin || remote.busy} onClick={remote.loadWebsite}>{t('Lấy favicon từ website')}</Button><span className="muted tiny">{remote.origin ?? t('Nhập website trong mục để lấy favicon.')}</span></div>
        {remote.busy && <div className="desktop-icon-progress" role="status"><span className="desktop-spinner" /><span className="grow">{t('Đang tải icon…')}</span><Button small variant="ghost" onClick={remote.cancel}>{t('Huỷ tải ảnh')}</Button></div>}
        {remote.error && <p className="danger" role="alert">{t(ICON_IMAGE_ERRORS[remote.error])}</p>}
        <p className="muted tiny">{t('Ảnh được lưu trong kho mã hoá và giữ nguyên đến khi bạn đổi biểu tượng.')}</p>
      </div>}
    </Dialog>
  </>;
}
