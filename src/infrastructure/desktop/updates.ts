export type UpdateStatus = 'idle' | 'checking' | 'current' | 'unavailable' | 'available' | 'downloading' | 'verifying' | 'staging' | 'ready' | 'restarting' | 'error';
export type UpdateErrorCode = 'NETWORK' | 'INVALID_MANIFEST' | 'INVALID_SIGNATURE' | 'INVALID_ARCHIVE' | 'INSTALL_LOCATION' | 'STORAGE_FULL' | 'INSTALL_FAILED';
export interface UpdateRelease { version: string; notes: string; publishedAt: string | null }
export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  release: UpdateRelease | null;
  checkedAt: string | null;
  receivedBytes: number;
  totalBytes: number | null;
  error: UpdateErrorCode | null;
  unavailableReason: 'development' | 'platform' | 'unpublished' | null;
}
export interface DesktopUpdatesBridge {
  getState(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  download(version: string): Promise<UpdateState>;
  restart(version: string): Promise<UpdateState>;
  onState(listener: (state: UpdateState) => void): () => void;
  onOpen(listener: () => void): () => void;
}

export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_STARTUP_DELAY_MS = 3000;
export const updateInProgress = (status: UpdateStatus) => ['checking', 'downloading', 'verifying', 'staging', 'restarting'].includes(status);
