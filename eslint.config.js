// Flat ESLint config (ESLint 9). Focused on the issues most likely to cause
// silent bugs in this codebase: stale-deps in hooks, unused variables, and
// implicit globals. Style rules are intentionally minimal — this is not a
// formatter.

import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "node_modules/**",
      "OCOrder/dist/**",
      "OCOrder/node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "uploads/**",
      "uploads-demo/**",
      "backups/**",
    ],
  },
  // Front-end (React, browser globals)
  {
    files: ["OCOrder/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        __BUILD_DATE__: "readonly",
      },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-vars": "error",
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  // Back-end (Node, ESM)
  {
    files: ["api/**/*.js", "OCOrder/server.js", "OCOrder/build.mjs", "*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  // Tests (vitest globals)
  {
    files: ["**/*.test.js", "test/**/*.js", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-unused-vars": "off" },
  },
];
