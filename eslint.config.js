const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'public/argon2.worker.js', 'test-results/*', 'playwright-report/*', 'desktop/tauri/target/**', 'desktop/tauri/test-runtime.js', 'desktop/tauri/gen/**'] },
  { rules: { 'no-console': 'error', '@typescript-eslint/no-explicit-any': 'error' } },
]);
