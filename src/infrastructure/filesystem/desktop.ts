import type { FilePort, LinkedVaultPort } from '@/core/storage/types';
import type { DesktopBridge } from '@/infrastructure/desktop/bridge';
import { desktopCall } from '@/infrastructure/desktop/bridge';

export class DesktopFilePort implements FilePort {
  constructor(private readonly bridge: DesktopBridge) {}
  read(path: string) { return desktopCall(() => this.bridge.files.read(path)); }
  writeNew(path: string, bytes: Uint8Array) { return desktopCall(() => this.bridge.files.writeNew(path, bytes)); }
  promote(from: string, to: string) { return desktopCall(() => this.bridge.files.promote(from, to)); }
  remove(path: string) { return desktopCall(() => this.bridge.files.remove(path)); }
  list(prefix: string) { return desktopCall(() => this.bridge.files.list(prefix)); }
}

export class DesktopLinkedVaultPort implements LinkedVaultPort {
  constructor(private readonly bridge: DesktopBridge) {}
  list() { return desktopCall(() => this.bridge.vaultFiles.list()); }
  read(id: string) { return desktopCall(() => this.bridge.vaultFiles.read(id)); }
  attach(...args: Parameters<LinkedVaultPort['attach']>) { return desktopCall(() => this.bridge.vaultFiles.attach(...args)); }
  write(...args: Parameters<LinkedVaultPort['write']>) { return desktopCall(() => this.bridge.vaultFiles.write(...args)); }
  chooseLocation(...args: Parameters<LinkedVaultPort['chooseLocation']>) { return desktopCall(() => this.bridge.vaultFiles.chooseLocation(...args)); }
  relocate(...args: Parameters<LinkedVaultPort['relocate']>) { return desktopCall(() => this.bridge.vaultFiles.relocate(...args)); }
  forget(id: string) { return desktopCall(() => this.bridge.vaultFiles.forget(id)); }
}
