import { useI18n } from '@/shared/hooks/use-i18n';
import { Button, Dialog } from './ui';

export type ConfirmationDialogProps = {
  open: boolean; title: string; description: string; confirmLabel: string; pending: boolean;
  onClose: () => void; onConfirm: () => void;
};

export function ConfirmationDialog({ open, title, description, confirmLabel, pending, onClose, onConfirm }: ConfirmationDialogProps) {
  const { t } = useI18n();
  return <Dialog open={open} title={title} description={description} onClose={onClose}
    footer={<><Button title={t("Huỷ")} variant="secondary" disabled={pending} onPress={onClose} />
      <Button title={confirmLabel} variant="danger" loading={pending} onPress={onConfirm} /></>} />;
}
