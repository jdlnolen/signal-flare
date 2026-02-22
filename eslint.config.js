// Source: https://typescript-eslint.io/getting-started/
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },

  // Base recommended rules for all files
  eslint.configs.recommended,
  tseslint.configs.recommended,

  // Prettier must come last — disables formatting rules that conflict with Prettier
  prettierConfig,

  // No console.log in MCP server src/ (PKG-03 enforcement)
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  // CLI and commands directories: console.log is fine
  {
    files: ['src/cli.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Wizard files use console.log per Phase 3 decision
  {
    files: ['src/wizard/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Test files: loosen some rules
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
