const bcrypt = require("bcrypt");

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function normalizeUsername(value) {
  return String(value || "").trim();
}

function validateCredentials(username, password) {
  if (!USERNAME_RE.test(username))
    return "Username must be 3–24 characters using letters, numbers, or underscores.";
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    return "Password must be 8–128 characters.";
  return null;
}

async function createUser(db, username, password) {
  const normalized = normalizeUsername(username);
  const validation = validateCredentials(normalized, password);
  if (validation)
    throw Object.assign(new Error(validation), { code: "VALIDATION" });

  const hash = await bcrypt.hash(password, 12);
  try {
    const user = await db.get(
      `INSERT INTO users(username, password) VALUES($1, $2)
       RETURNING id, username, score, xp, created_at`,
      [normalized, hash],
    );
    return user;
  } catch (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("Username is already taken."), {
        code: "DUPLICATE",
      });
    }
    throw error;
  }
}

async function authenticate(db, username, password) {
  const user = await db.get(
    `SELECT id, username, password, score, xp, created_at
     FROM users WHERE username = $1`,
    [normalizeUsername(username)],
  );
  if (!user || !(await bcrypt.compare(password, user.password))) return null;
  return {
    id: user.id,
    username: user.username,
    score: user.score,
    xp: user.xp,
    created_at: user.created_at,
  };
}

async function getPublicUser(db, id) {
  return db.get(
    "SELECT id, username, score, xp, created_at FROM users WHERE id = $1",
    [id],
  );
}

async function getDashboard(db, userId) {
  const [user, leaders, stats] = await Promise.all([
    getPublicUser(db, userId),
    db.all(
      "SELECT username, score, xp FROM users ORDER BY score DESC, xp DESC, id ASC LIMIT 10",
    ),
    db.get(
      `SELECT COUNT(*)::int AS quizzes,
              COALESCE(SUM(correct_answers),0)::int AS correct,
              COALESCE(SUM(total_questions),0)::int AS total
       FROM quiz_attempts
       WHERE user_id = $1 AND completed_at IS NOT NULL`,
      [userId],
    ),
  ]);
  return { user, leaders, stats };
}

function rankForScore(score) {
  if (score >= 1000) return "Legend";
  if (score >= 500) return "Master";
  if (score >= 250) return "Elite";
  if (score >= 100) return "Veteran";
  return "Recruit";
}

module.exports = {
  createUser,
  authenticate,
  getPublicUser,
  getDashboard,
  rankForScore,
  validateCredentials,
};
