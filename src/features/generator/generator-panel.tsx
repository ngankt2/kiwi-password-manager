import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownLeft, Copy, Minus, Plus, RefreshCw, WandSparkles } from 'lucide-react-native';
import { Button, Chip, Divider, Eyebrow, IconButton, Input, T, ToggleRow } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { DEFAULT_PASSWORD_OPTIONS, DEFAULT_PASSPHRASE_OPTIONS, generatePassphrase, generatePassword } from '@/core/security/generator';
import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { clipboard } from '@/infrastructure/clipboard';
import { session } from '@/infrastructure/session';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';

function generateResult(mode: 'password' | 'passphrase', options: typeof DEFAULT_PASSWORD_OPTIONS, phrase: typeof DEFAULT_PASSPHRASE_OPTIONS) {
  try { return { value: mode === 'password' ? generatePassword(cryptoProvider, options) : generatePassphrase(cryptoProvider, phrase), error: '' }; }
  catch { return { value: '', error: 'Choose at least one character type.' }; }
}

export function GeneratorPanel({ onUse }: { onUse?: (value: string) => void }) {
  const [mode, updateMode] = useState<'password' | 'passphrase'>('password');
  const [options, updateOptions] = useState(DEFAULT_PASSWORD_OPTIONS);
  const [phrase, updatePhrase] = useState(DEFAULT_PASSPHRASE_OPTIONS);
  const [{ value, error }, setResult] = useState(() => generateResult('password', DEFAULT_PASSWORD_OPTIONS, DEFAULT_PASSPHRASE_OPTIONS));
  const { settings } = useSession(); const { run } = useAction();
  const generate = () => setResult(generateResult(mode, options, phrase));
  const setMode = (next: typeof mode) => { updateMode(next); setResult(generateResult(next, options, phrase)); };
  const setOptions = (next: typeof options) => { updateOptions(next); setResult(generateResult(mode, next, phrase)); };
  const setPhrase = (next: typeof phrase) => { updatePhrase(next); setResult(generateResult(mode, options, next)); };
  return <View style={{ gap: 20 }}>
    <View style={{ flexDirection: 'row', gap: 9 }}><Chip label="Password" selected={mode === 'password'} onPress={() => setMode('password')} /><Chip label="Passphrase" selected={mode === 'passphrase'} onPress={() => setMode('passphrase')} /></View>
    <View style={styles.result}><Eyebrow>{mode === 'password' ? 'YOUR NEW PASSWORD' : 'YOUR NEW PASSPHRASE'}</Eyebrow><T mono style={{ fontSize: 20, lineHeight: 32, marginVertical: 18 }} selectable accessibilityLabel="Generated secret. Use the copy button to copy it.">{value || error}</T><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flexDirection: 'row', gap: 5 }}><View style={styles.strength} /><View style={styles.strength} /><View style={styles.strength} /><View style={[styles.strength, { backgroundColor: options.length >= 16 || mode === 'passphrase' ? colors.primary : colors.strong }]} /></View><IconButton icon={RefreshCw} label="Generate again" onPress={generate} /></View></View>
    {mode === 'password' ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><T weight="medium">Password length</T><T muted style={{ fontSize: 12 }}>Longer is stronger.</T></View><IconButton icon={Minus} label="Decrease password length" disabled={options.length <= 8} onPress={() => setOptions({ ...options, length: options.length - 1 })} /><T mono style={{ minWidth: 35, textAlign: 'center', fontSize: 20 }}>{options.length}</T><IconButton icon={Plus} label="Increase password length" disabled={options.length >= 128} onPress={() => setOptions({ ...options, length: options.length + 1 })} /></View>
      <View>{([['uppercase', 'Uppercase', 'A–Z'], ['lowercase', 'Lowercase', 'a–z'], ['numbers', 'Numbers', '0–9'], ['symbols', 'Symbols', '! @ # $ %'], ['avoidAmbiguous', 'Avoid ambiguous characters', 'Keep similar-looking letters and numbers out.']] as const).map(([key, title, detail]) => <ToggleRow key={key} title={title} detail={detail} value={options[key]} onChange={(value) => setOptions({ ...options, [key]: value })} />)}</View>
    </> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><T style={{ flex: 1 }}>Number of words</T><IconButton icon={Minus} label="Fewer words" disabled={phrase.words <= 4} onPress={() => setPhrase({ ...phrase, words: phrase.words - 1 })} /><T mono>{phrase.words}</T><IconButton icon={Plus} label="More words" disabled={phrase.words >= 12} onPress={() => setPhrase({ ...phrase, words: phrase.words + 1 })} /></View>
      <Input label="Word separator" value={phrase.separator} onChangeText={(separator) => setPhrase({ ...phrase, separator })} maxLength={8} />
      <ToggleRow title="Capitalize words" value={phrase.capitalize} onChange={(capitalize) => setPhrase({ ...phrase, capitalize })} /><ToggleRow title="Include a number" value={phrase.includeNumber} onChange={(includeNumber) => setPhrase({ ...phrase, includeNumber })} />
    </>}
    <Divider /><View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}><Button title="Copy" icon={Copy} disabled={!value} variant={onUse ? 'secondary' : 'primary'} onPress={() => run(async () => { const result = await clipboard.copy(value, settings.clipboardSeconds); session.notify(result.autoClears ? `Copied. Clears in ${settings.clipboardSeconds} seconds.` : 'Copied to clipboard.'); })} />{onUse && <Button title="Use this password" icon={ArrowDownLeft} disabled={!value} onPress={() => onUse(value)} />}</View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><WandSparkles size={13} color={colors.secondary} /><T muted style={{ fontSize: 11 }}>Generated securely on this device.</T></View>
  </View>;
}
const styles = StyleSheet.create({ result: { borderWidth: 1, borderColor: colors.strong, padding: 20, borderRadius: 13, backgroundColor: colors.surface }, strength: { width: 30, height: 3, borderRadius: 2, backgroundColor: colors.primary } });
