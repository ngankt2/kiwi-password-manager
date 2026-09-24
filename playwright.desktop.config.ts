import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/desktop', timeout: 120_000, expect: { timeout: 20_000 }, workers: 1, fullyParallel: false,
  retries: 0, reporter: [['list'], ['json', { outputFile: 'tests/reports/desktop-e2e.json' }]],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
