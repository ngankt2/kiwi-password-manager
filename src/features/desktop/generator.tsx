import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { DEFAULT_PASSWORD_OPTIONS, DEFAULT_PASSPHRASE_OPTIONS, generatePassword, generatePassphrase } from '@/core/security/generator';
import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { PASSPHRASE_WORDS } from '@/core/security/words';
import { useSecretActions } from './actions';
import { Button, IconButton, Input, PasswordStrength } from './ui';

function createValue(mode: 'password' | 'passphrase', options: typeof DEFAULT_PASSWORD_OPTIONS, phrase: typeof DEFAULT_PASSPHRASE_OPTIONS) {
  try { return mode === 'password' ? generatePassword(cryptoProvider, options) : generatePassphrase(cryptoProvider, phrase); }
  catch { return ''; }
}
export function DesktopGenerator({ onUse, onClose }: { onUse?: (value: string) => void; onClose?: () => void }) {
  const { t } = useI18n();
  const [mode, updateMode] = useState<'password' | 'passphrase'>('password');
  const [options, updateOptions] = useState(DEFAULT_PASSWORD_OPTIONS);
  const [phrase, updatePhrase] = useState(DEFAULT_PASSPHRASE_OPTIONS);
  const [value, setValue] = useState(() => createValue('password', DEFAULT_PASSWORD_OPTIONS, DEFAULT_PASSPHRASE_OPTIONS));
  const { copy, authDialog } = useSecretActions();
  const setOptions = (next: typeof options) => { updateOptions(next); setValue(createValue(mode, next, phrase)); };
  const setPhrase = (next: typeof phrase) => { updatePhrase(next); setValue(createValue(mode, options, next)); };
  const setMode = (next: typeof mode) => { updateMode(next); setValue(createValue(next, options, phrase)); };
  return <div className="desktop-generator">
    <div className="desktop-generator-tabs"><button aria-pressed={mode === 'password'} onClick={() => setMode('password')}>{t("Mật khẩu")}</button><button aria-pressed={mode === 'passphrase'} onClick={() => setMode('passphrase')}>{t("Passphrase")}</button></div>
    <div className="desktop-generator-result"><div className="desktop-generator-secret" aria-label={t("Mật khẩu được tạo")}>{value ? Array.from(value).map((char, index) => <span key={index} style={{ color: /[0-9]/.test(char) ? 'var(--color-accent)' : /[^a-zA-Z0-9]/.test(char) ? 'var(--color-warning)' : 'var(--color-text)' }}>{char}</span>) : <span className="desktop-error">{t("Chọn ít nhất một loại ký tự.")}</span>}</div><IconButton icon="refresh" label={t("Tạo lại")} onClick={() => setValue(createValue(mode, options, phrase))} /><IconButton icon="content_copy" label={t("Sao chép mật khẩu được tạo")} disabled={!value} onClick={() => copy(value)} /></div>
    <PasswordStrength value={value} entropyBits={mode === 'passphrase' ? phrase.words * Math.log2(PASSPHRASE_WORDS.length) + (phrase.includeNumber ? Math.log2(1000) : 0) : undefined} />
    {mode === 'password' ? <>
      <div className="desktop-generator-length"><div><label htmlFor="password-length" className="grow">{t("Độ dài")}</label><span className="mono">{options.length}</span></div><input id="password-length" type="range" min={8} max={64} value={options.length} onChange={(event) => setOptions({ ...options, length: Number(event.target.value) })} /></div>
      <div>{([
        ['uppercase', t("Chữ hoa"), 'A–Z'], ['lowercase', t("Chữ thường"), 'a–z'], ['numbers', t("Chữ số"), '0–9'], ['symbols', t("Ký tự đặc biệt"), '! @ # $'], ['avoidAmbiguous', t("Loại bỏ ký tự dễ nhầm"), 'O 0 l 1'],
      ] as const).map(([key, label, sample]) => <label key={key} className="desktop-generator-option"><input type="checkbox" checked={options[key]} onChange={(event) => setOptions({ ...options, [key]: event.target.checked })} /><span className="grow">{label}</span><span>{sample}</span></label>)}</div>
    </> : <>
      <div className="desktop-generator-length"><div><label htmlFor="phrase-length" className="grow">{t("Số từ")}</label><span className="mono">{phrase.words}</span></div><input id="phrase-length" type="range" min={4} max={12} value={phrase.words} onChange={(event) => setPhrase({ ...phrase, words: Number(event.target.value) })} /></div>
      <Input label={t("Ký tự phân cách")} value={phrase.separator} onChange={(event) => setPhrase({ ...phrase, separator: event.target.value })} maxLength={8} />
      <label className="desktop-generator-option"><input type="checkbox" checked={phrase.capitalize} onChange={(event) => setPhrase({ ...phrase, capitalize: event.target.checked })} />{t("Viết hoa đầu từ")}</label>
      <label className="desktop-generator-option"><input type="checkbox" checked={phrase.includeNumber} onChange={(event) => setPhrase({ ...phrase, includeNumber: event.target.checked })} />{t("Thêm chữ số")}</label>
    </>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>{onClose && <Button onClick={onClose}>{t("Huỷ")}</Button>}{onUse && <Button variant="primary" disabled={!value} onClick={() => onUse(value)}>{t("Dùng mật khẩu")}</Button>}</div>
    {authDialog}
  </div>;
}
