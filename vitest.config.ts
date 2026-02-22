// Source: https://vitest.dev/guide/coverage + https://vitest.dev/guide/reporters
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts',
        'src/server.ts',
        'src/hook-handler.ts',
        'src/hooks/watcher.ts',
        'src/commands/**/*.ts',
        'src/wizard/**/*.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      reporter: ['text', 'json', 'html'],
    },
    reporters: process.env.GITHUB_ACTIONS ? ['dot', 'github-actions'] : ['default'],
  },
});
