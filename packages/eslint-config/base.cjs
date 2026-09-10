'use strict';

const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettierConfig = require('eslint-config-prettier');

/**
 * Shared base ESLint config for OpenClaw Mission Control packages.
 * Apps/packages layer this on top with `extends: ['@openclaw-mc/eslint-config']`.
 */
module.exports = {
  root: false,
  parser: tsparser,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  rules: {
    ...tseslint.configs.recommended.rules,
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    'no-console': 'off',
    'prefer-const': 'warn',
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
  },
  ignorePatterns: [
    'dist/**',
    '.next/**',
    'node_modules/**',
    'coverage/**',
    '**/*.d.ts',
  ],
  ...prettierConfig,
};