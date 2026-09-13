const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters long.");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Use a PostgreSQL connection string.",
  );
}

const DB_POOL_MAX = Number.parseInt(process.env.DB_POOL_MAX || "20", 10);
if (!Number.isInteger(DB_POOL_MAX) || DB_POOL_MAX < 1 || DB_POOL_MAX > 100) {
  throw new Error("DB_POOL_MAX must be an integer between 1 and 100.");
}

const QUESTION_REFRESH_ENABLED =
  process.env.QUESTION_REFRESH_ENABLED !== "false";

module.exports = {
  NODE_ENV,
  PORT,
  SESSION_SECRET,
  DATABASE_URL,
  DB_POOL_MAX,
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  QUESTION_REFRESH_ENABLED,
};
