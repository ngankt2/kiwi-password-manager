import { useState } from 'react';
import { LockKeyhole } from 'lucide-react-native';
import { Button, Dialog, Input } from './ui';
import { session } from '@/infrastructure/session';
import { safeError } from '@/core/errors';
import { useI18n } from '@/shared/hooks/use-i18n';

export function ReauthDialog({ title = 'Confirm it’s you', description = 'Enter your master password to continue.', action, onClose, confirmLabel, destructive = false }: {
  title?: string; description?: string; action: ((password: string) => Promise<void>) | null; onClose: () => void; confirmLabel?: string; destructive?: boolean;
}) {
  const { t, text } = useI18n();
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const close = () => { setPassword(''); setError(''); onClose(); };
  const submit = () => {
    if (!action || pending) return;
    setPending(true); setError('');
    void action(password).then(close).catch((error: unknown) => setError(safeError(error, 'AUTHENTICATION').message)).finally(() => { setPending(false); setPassword(''); });
  };
  return <Dialog open={action !== null} title={text(title)} description={text(description)} onClose={() => { if (!pending) close(); }} footer={<><Button title={t('Huỷ')} variant="ghost" disabled={pending} onPress={close} /><Button title={confirmLabel ?? t('Xác nhận')} variant={destructive ? 'danger' : 'primary'} icon={LockKeyhole} loading={pending} disabled={!password} onPress={submit} /></>}>
    <Input label={t('Mật khẩu chính')} value={password} onChangeText={(value) => { setPassword(value); session.clearError(); }} secret autoFocus onSubmitEditing={destructive ? undefined : submit} error={text(error)} />
  </Dialog>;
}
