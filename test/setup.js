// test/setup.js — Global setup for all Vitest test files
// Loaded via vitest.config.js setupFiles before each test file.

process.env.REDIS_URL      = process.env.TEST_REDIS_URL || "redis://localhost:6379";
process.env.ADMIN_USER     = "testadmin@example.com";
process.env.ADMIN_PASS     = "TestPass123!";
process.env.TOKEN_SECRET   = "test-token-secret-32-chars-minimum";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";  // overridden per-test as needed
