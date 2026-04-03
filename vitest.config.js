// vitest.config.js (repo root)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ESM project — run tests in Node environment by default
    environment: "node",

    // Include colocated test files in api/ and src/
    include: [
      "api/**/*.test.js",
      "src/**/*.test.jsx",
      "src/**/*.test.js",
    ],

    // Setup file runs before every test file
    setupFiles: ["./test/setup.js"],

    // v8 native coverage provider (fastest; no instrumentation)
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",

      // Files measured for coverage — only changed/tested code
      include: [
        "api/_lib/**/*.js",
        "api/auth/**/*.js",
        "api/config/**/*.js",
        "api/orders/**/*.js",
        "api/lots/**/*.js",
        "api/data.js",
        "api/plans.js",
      ],

      // Hard thresholds — npm run test:coverage fails if any fall below 100%
      thresholds: {
        lines:      100,
        functions:  100,
        branches:   100,
        statements: 100,
      },
    },

    // Allow top-level await in test files (required by ESM handlers)
    globals: false,

    // Exit 0 when no test files are found (expected during infra-only phase)
    passWithNoTests: true,
  },
});
