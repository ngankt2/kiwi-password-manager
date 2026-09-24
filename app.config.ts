import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name!,
  slug: config.slug!,
  // Desktop uses its native downloader; the browser needs a same-origin API for CORS.
  web: { ...config.web, output: process.env.KIRO_DESKTOP_EXPORT === '1' ? 'static' : 'server' },
});
