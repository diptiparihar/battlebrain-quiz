const test = require("node:test");
const assert = require("node:assert/strict");

test("application modules load", async () => {
  process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-ci-123456";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/battlebrain";
  const app = require("../src/app");
  assert.equal(typeof app, "function");
});

test("quiz rules reject invalid answers", async () => {
  const quiz = require("../src/services/quizService");
  assert.equal(quiz.isAnswer("A"), true);
  assert.equal(quiz.isAnswer("timeout"), true);
  assert.equal(quiz.isAnswer("E"), false);
  assert.equal(quiz.normalizeDifficulty("HARD"), "hard");
  assert.equal(quiz.normalizeCategory("Science"), "Science");
});
