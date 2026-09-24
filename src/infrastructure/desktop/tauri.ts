import type { DesktopBridge } from './bridge';

// Native mobile bundles do not import the desktop runtime or its browser API.
export function createTauriBridge(): DesktopBridge | undefined { return undefined; }
