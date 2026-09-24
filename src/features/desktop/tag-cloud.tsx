import { useI18n } from '@/shared/hooks/use-i18n';
import { Icon, IconButton } from './ui';

export function TagCloud({ tags, activeTag, onSelect }: {
  tags: { tag: string; count: number }[]; activeTag: string | null; onSelect: (tag: string | null) => void;
}) {
  const { t } = useI18n();
  return <section className="desktop-sidebar-tags" aria-label={t('Lọc theo thẻ')}>
    <div className="desktop-tag-heading"><span className="desktop-section-label grow">{t('Thẻ')}</span>
      {activeTag && <IconButton icon="filter_alt_off" label={t('Bỏ lọc thẻ')} onClick={() => onSelect(null)} />}
    </div>
    <div className="desktop-tag-cloud">
      {tags.map(({ tag, count }) => <button key={tag} type="button" className={'desktop-tag-badge' + (activeTag === tag ? ' selected' : '')}
        aria-label={t('Lọc theo thẻ {tag}', { tag })} aria-pressed={activeTag === tag} title={tag} onClick={() => onSelect(activeTag === tag ? null : tag)}>
        <Icon name="tag" size={12} /><span className="desktop-tag-name">{tag}</span><span className="desktop-tag-count">{count}</span>
      </button>)}
      {!tags.length && <span className="muted tiny">{t('Chưa có thẻ.')}</span>}
    </div>
  </section>;
}
