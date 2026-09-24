import { useI18n } from '@/shared/hooks/use-i18n';
import { Button, Dialog } from '@/features/desktop/ui';
import type { ConfirmationDialogProps } from './confirmation-dialog';

export function ConfirmationDialog({ open, title, description, confirmLabel, pending, onClose, onConfirm }: ConfirmationDialogProps) {
  const { t } = useI18n();
  return <Dialog open={open} title={title} description={description} onClose={onClose}
    footer={<><Button autoFocus disabled={pending} onClick={onClose}>{t("Huỷ")}</Button>
      <Button variant="danger" busy={pending} onClick={onConfirm}>{confirmLabel}</Button></>} />;
}
