import { useRef, useState } from 'react';
import { ConfirmationDialog } from '@/design-system/components/confirmation-dialog';
import { session } from '@/infrastructure/session';

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
};

/** The action is only invoked by the dialog's explicit confirmation button. */
export function useConfirmation() {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const [pending, setPending] = useState(false);
  const executing = useRef(false);
  const close = () => { if (!executing.current) setRequest(null); };
  const submit = async () => {
    if (!request || executing.current) return;
    executing.current = true;
    setPending(true);
    try {
      await request.onConfirm();
      setRequest(null);
    } catch (error) {
      session.report(error);
    } finally {
      executing.current = false;
      setPending(false);
    }
  };
  return {
    confirm: (next: Confirmation) => { if (!executing.current) setRequest(next); },
    confirmationDialog: <ConfirmationDialog open={!!request} title={request?.title ?? ''} description={request?.description ?? ''}
      confirmLabel={request?.confirmLabel ?? ''} pending={pending} onClose={close} onConfirm={submit} />,
  };
}
