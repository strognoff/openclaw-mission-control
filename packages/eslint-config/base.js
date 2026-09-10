'use strict';

/**
 * Shared base ESLint config for OpenClaw Mission Control packages.
 * Apps/packages layer this on top with `extends: ['@openclaw-mc/eslint-config/node']`.
 */

module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off', // we use any in hook contexts
    '@typescript-eslint/consistent-type-imports': 'off',
    'no-console': 'off',
    'prefer-const': 'warn',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
  },
  ignorePatterns: ['dist/', '.next/', 'node_modules/', 'coverage/', '**/*.d.ts'],
};