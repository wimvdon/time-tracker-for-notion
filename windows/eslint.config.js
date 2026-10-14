import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'release/', 'node_modules/'] },
  js.configs.recommended,
  {
    // The Electron main process, preload and build scripts: Node.js, CommonJS.
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs', '*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // The UI: browser code, no Node.js.
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The classic hook rules. The newer React Compiler rules (set-state-in-effect, refs, …)
      // ask for rewrites of patterns that work; see docs/decisions.md.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // The UI reaches the system only through window.notionAPI (electron/preload.cjs).
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['electron', 'node:*', 'fs', 'path', 'child_process'], message: 'Use window.notionAPI (electron/preload.cjs) instead.' }] },
      ],
    },
  },
  {
    // Tests run in Node.js (node --test) and may use its modules.
    files: ['**/*.test.{js,cjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // A leading underscore marks a value that is deliberately unused.
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }] },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
