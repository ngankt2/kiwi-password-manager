export const colors = {
  background: 'var(--color-background)', surface: 'var(--color-surface)', elevated: 'var(--color-elevated)', strong: 'var(--color-control-border)',
  primary: 'var(--color-accent)', primaryHover: 'var(--color-primary-hover)', primaryMuted: 'var(--color-accent-muted)',
  text: 'var(--color-text)', secondary: 'var(--color-secondary)', muted: 'var(--color-dim)', border: 'var(--color-border)',
  warning: 'var(--color-warning)', error: 'var(--color-danger)', errorText: 'var(--color-danger)', dangerMuted: 'var(--color-danger-bg)', onPrimary: 'var(--color-on-primary)',
  success: 'var(--color-success)', favorite: 'var(--color-favorite)',
  fill: 'var(--glass-control)', fillHover: 'var(--glass-control-hover)', selected: 'var(--color-selected)',
  overlay: 'var(--color-overlay)', chrome: 'var(--glass-menu)',
};
export const weights = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
const sans = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif";
export const fonts = { regular: sans, medium: sans, semibold: sans, bold: sans, mono: "ui-monospace, 'SF Mono', Menlo, monospace" };
export const layout = { sidebar: 236, list: 330, tablet: 760, desktop: 1120, touch: 32, radius: 8 };
export const motion = { fast: 120, normal: 180 };
export const monoFallback = "ui-monospace, 'SF Mono', Menlo, monospace";
