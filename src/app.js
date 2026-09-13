require("dotenv").config();

const path = require("node:path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const sessionStore = require("./config/sessionStore");
const db = require("./config/database");
const { NODE_ENV, SESSION_SECRET, TRUST_PROXY } = require("./config/env");
const { requireAuth } = require("./middleware/auth");
const { csrfToken, csrfProtection } = require("./middleware/csrf");
const users = require("./services/userService");
const quiz = require("./services/quizService");

const app = express();

if (TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    maxAge: NODE_ENV === "production" ? "7d" : 0,
    etag: true,
  }),
);

app.use(
  session({
    name: "battlebrain.sid",
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.csrfToken = csrfToken(req);
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Try again later.",
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);
app.use("/signup", authLimiter);
app.use("/login", authLimiter);
app.use(csrfProtection);

function renderError(req, res, status, message) {
  if (req.path.startsWith("/api/"))
    return res.status(status).json({ success: false, message });
  return res.status(status).send(message);
}

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/dashboard");
  res.render("auth");
});

app.post("/signup", async (req, res, next) => {
  try {
    const user = await users.createUser(
      db,
      req.body.username,
      req.body.password,
    );
    await new Promise((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.userId = user.id;
    res.redirect("/dashboard");
  } catch (error) {
    if (["VALIDATION", "DUPLICATE"].includes(error.code))
      return res.status(400).send(error.message);
    next(error);
  }
});

app.post("/login", async (req, res, next) => {
  try {
    const user = await users.authenticate(
      db,
      req.body.username,
      req.body.password,
    );
    if (!user) return res.status(401).send("Invalid username or password.");
    await new Promise((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.userId = user.id;
    res.redirect("/dashboard");
  } catch (error) {
    next(error);
  }
});

app.post("/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("battlebrain.sid");
    res.redirect("/");
  });
});

app.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const data = await users.getDashboard(db, req.session.userId);
    if (!data.user) return res.redirect("/");
    const total = Number(data.stats.total);
    const correct = Number(data.stats.correct);
    res.render("dashboard", {
      ...data,
      rank: users.rankForScore(data.user.score),
      stats: {
        ...data.stats,
        accuracy: total ? Math.round((correct / total) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/game", requireAuth, (_req, res) => res.render("game"));

app.post("/api/quiz/start", requireAuth, async (req, res, next) => {
  try {
    res.json({
      success: true,
      quiz: await quiz.startQuiz(
        db,
        req.session.userId,
        req.body.category,
        req.body.difficulty,
      ),
    });
  } catch (error) {
    const status = { VALIDATION: 400, NOT_FOUND: 404 }[error.code];
    if (status)
      return res
        .status(status)
        .json({ success: false, message: error.message });
    next(error);
  }
});

app.post("/api/quiz/:attemptId/answer", requireAuth, async (req, res, next) => {
  try {
    const result = await quiz.answerQuestion(
      db,
      req.session.userId,
      Number(req.params.attemptId),
      Number(req.body.questionId),
      req.body.answer,
    );
    res.json({ success: true, result });
  } catch (error) {
    const status = {
      VALIDATION: 400,
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      DUPLICATE: 409,
      COMPLETED: 409,
    }[error.code];
    if (status)
      return res
        .status(status)
        .json({ success: false, message: error.message });
    next(error);
  }
});

app.post(
  "/api/quiz/:attemptId/complete",
  requireAuth,
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        result: await quiz.completeQuiz(
          db,
          req.session.userId,
          Number(req.params.attemptId),
        ),
      });
    } catch (error) {
      const status = { VALIDATION: 400, NOT_FOUND: 404, COMPLETED: 409 }[
        error.code
      ];
      if (status)
        return res
          .status(status)
          .json({ success: false, message: error.message });
      next(error);
    }
  },
);

app.get("/api/quiz/history", requireAuth, async (req, res, next) => {
  try {
    res.json({
      success: true,
      attempts: await quiz.history(db, req.session.userId),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/quiz/:attemptId/result", requireAuth, async (req, res, next) => {
  try {
    res.json({
      success: true,
      ...(await quiz.result(
        db,
        req.session.userId,
        Number(req.params.attemptId),
      )),
    });
  } catch (error) {
    if (error.code === "NOT_FOUND")
      return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
});

app.get("/api/categories", requireAuth, async (_req, res, next) => {
  try {
    res.json({ success: true, categories: await quiz.categories(db) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile", requireAuth, async (req, res, next) => {
  try {
    const user = await users.getPublicUser(db, req.session.userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    res.json({
      success: true,
      profile: { ...user, rank: users.rankForScore(user.score) },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leaderboard", requireAuth, async (req, res, next) => {
  try {
    const raw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 50) : 10;
    const leaderboard = await db.all(
      `SELECT id, username, score, xp FROM users
       ORDER BY score DESC, xp DESC, id ASC LIMIT $1`,
      [limit],
    );
    res.json({
      success: true,
      leaderboard: leaderboard.map((p, i) => ({
        position: i + 1,
        ...p,
        rank: users.rankForScore(p.score),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => renderError(req, res, 404, "Route not found."));
app.use((error, req, res, _next) => {
  console.error(`[${new Date().toISOString()}]`, error);
  if (!res.headersSent) renderError(req, res, 500, "Internal server error.");
});

module.exports = app;
