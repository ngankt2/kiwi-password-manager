import type { PickedFile } from '@/infrastructure/filesystem/transfer';
let pending: PickedFile | null = null;
export const fileHandoff = {
  set(file: PickedFile) { pending = file; },
  take() { const file = pending; pending = null; return file; },
  clear() { pending?.bytes.fill(0); pending = null; },
};
