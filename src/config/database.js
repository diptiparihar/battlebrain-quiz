const { Pool } = require("pg");
const { DATABASE_URL, NODE_ENV, DB_POOL_MAX } = require("./env");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  console.error("[database] unexpected idle client error", error);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function get(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function all(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function run(text, params = []) {
  const result = await query(text, params);

  return {
    rowCount: result.rowCount,
    rows: result.rows,
    insertId: result.rows[0]?.id ?? null,
  };
}

async function transaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tx = {
      query: (text, params = []) => client.query(text, params),

      get: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows[0] || null;
      },

      all: async (text, params = []) => {
        const result = await client.query(text, params);
        return result.rows;
      },

      run: async (text, params = []) => {
        const result = await client.query(text, params);

        return {
          rowCount: result.rowCount,
          rows: result.rows,
          insertId: result.rows[0]?.id ?? null,
        };
      },
    };

    const result = await work(tx);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  /*
   * ---------------------------------------------------------
   * 1. CREATE TABLES
   * ---------------------------------------------------------
   */

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(24) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS questions (
      id BIGSERIAL PRIMARY KEY,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'local',
      question TEXT NOT NULL,
      opt_a TEXT NOT NULL,
      opt_b TEXT NOT NULL,
      opt_c TEXT NOT NULL,
      opt_d TEXT NOT NULL,
      answer CHAR(1) NOT NULL CHECK (answer IN ('A','B','C','D')),
      category VARCHAR(40) NOT NULL,
      difficulty VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (difficulty IN ('easy','medium','hard')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      random_key DOUBLE PRECISION NOT NULL DEFAULT RANDOM(),
      UNIQUE(source, external_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(40) NOT NULL,
      total_questions INTEGER NOT NULL CHECK (total_questions > 0),
      correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
      score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
      xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS attempt_questions (
      attempt_id BIGINT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      position INTEGER NOT NULL CHECK (position > 0),
      PRIMARY KEY (attempt_id, question_id),
      UNIQUE (attempt_id, position)
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      selected_answer VARCHAR(8) NOT NULL
        CHECK (selected_answer IN ('A','B','C','D','TIMEOUT')),
      correct BOOLEAN NOT NULL DEFAULT FALSE,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid VARCHAR(255) PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ
    );
  `);

  /*
   * ---------------------------------------------------------
   * 2. SAFE COMPATIBILITY UPGRADES
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * These run BEFORE the indexes so old databases also work.
   */

  await query(`
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS external_id TEXT;

    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local';

    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      NOT NULL DEFAULT NOW();

    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS random_key DOUBLE PRECISION
      NOT NULL DEFAULT RANDOM();
  `);

  /*
   * ---------------------------------------------------------
   * 3. INDEXES
   * ---------------------------------------------------------
   *
   * random_key now definitely exists before this index is made.
   */

  await query(`
    CREATE INDEX IF NOT EXISTS idx_questions_category_difficulty_random
      ON questions(category, difficulty, random_key, id);

    CREATE INDEX IF NOT EXISTS idx_questions_source
      ON questions(source);

    CREATE INDEX IF NOT EXISTS idx_attempts_user_started
      ON quiz_attempts(user_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_attempt_questions_attempt
      ON attempt_questions(attempt_id, position);

    CREATE INDEX IF NOT EXISTS idx_answers_attempt
      ON quiz_answers(attempt_id);

    CREATE INDEX IF NOT EXISTS idx_leaderboard
      ON users(score DESC, xp DESC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_sessions_expire
      ON sessions(expire);
  `);

  console.log("[database] migration completed successfully");
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  get,
  all,
  run,
  transaction,
  migrate,
  close,
};
