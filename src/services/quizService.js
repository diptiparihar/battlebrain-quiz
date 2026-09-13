const { CATEGORY_NAMES } = require("./questionService");

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ANSWERS = new Set(["A", "B", "C", "D", "TIMEOUT"]);
const QUESTION_LIMIT = 15;
const POINTS = { easy: 10, medium: 15, hard: 20 };
const XP = { easy: 10, medium: 15, hard: 25 };

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return CATEGORY_NAMES.includes(category) ? category : null;
}

function normalizeDifficulty(value) {
  const difficulty = String(value || "")
    .trim()
    .toLowerCase();
  return DIFFICULTIES.has(difficulty) ? difficulty : null;
}

function isAnswer(value) {
  return ANSWERS.has(
    String(value || "")
      .trim()
      .toUpperCase(),
  );
}

async function startQuiz(db, userId, category, difficulty) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  if (!normalizedCategory)
    throw Object.assign(new Error("Invalid category."), { code: "VALIDATION" });
  if (difficulty && !normalizedDifficulty)
    throw Object.assign(new Error("Invalid difficulty."), {
      code: "VALIDATION",
    });

  const randomPoint = Math.random();
  const baseParams = [normalizedCategory];
  let filter = "category = $1";
  if (normalizedDifficulty) {
    filter += " AND difficulty = $2";
    baseParams.push(normalizedDifficulty);
  }

  async function sampleQuestions(
    comparison,
    point,
    sourceFilter = filter,
    sourceParams = baseParams,
  ) {
    const params = [...sourceParams, point, QUESTION_LIMIT];
    return db.all(
      `SELECT id, question, opt_a, opt_b, opt_c, opt_d, category, difficulty
       FROM questions
       WHERE ${sourceFilter} AND random_key ${comparison} $${params.length - 1}
       ORDER BY random_key ${comparison === ">=" ? "ASC" : "DESC"}, id
       LIMIT $${params.length}`,
      params,
    );
  }

  let questions = await sampleQuestions(">=", randomPoint);

  if (questions.length < QUESTION_LIMIT) {
    const existingIds = new Set(questions.map((question) => question.id));
    const fallbackFilter = normalizedDifficulty ? "category = $1" : filter;
    const fallbackParams = normalizedDifficulty
      ? [normalizedCategory]
      : baseParams;
    const additional = await sampleQuestions(
      "<",
      randomPoint,
      fallbackFilter,
      fallbackParams,
    );
    for (const question of additional) {
      if (!existingIds.has(question.id)) questions.push(question);
      if (questions.length >= QUESTION_LIMIT) break;
    }
  }

  if (!questions.length)
    throw Object.assign(
      new Error("No questions are available for this selection."),
      { code: "NOT_FOUND" },
    );

  return db.transaction(async (tx) => {
    const attempt = await tx.get(
      `INSERT INTO quiz_attempts(user_id, category, total_questions)
       VALUES($1,$2,$3) RETURNING id`,
      [userId, normalizedCategory, questions.length],
    );

    for (let i = 0; i < questions.length; i += 1) {
      await tx.run(
        `INSERT INTO attempt_questions(attempt_id, question_id, position)
         VALUES($1,$2,$3)`,
        [attempt.id, questions[i].id, i + 1],
      );
    }

    return {
      attemptId: attempt.id,
      category: normalizedCategory,
      difficulty: normalizedDifficulty || "mixed",
      totalQuestions: questions.length,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: { A: q.opt_a, B: q.opt_b, C: q.opt_c, D: q.opt_d },
        difficulty: q.difficulty,
      })),
    };
  });
}

async function answerQuestion(db, userId, attemptId, questionId, answer) {
  if (
    !Number.isInteger(attemptId) ||
    attemptId <= 0 ||
    !Number.isInteger(questionId) ||
    questionId <= 0 ||
    !isAnswer(answer)
  ) {
    throw Object.assign(new Error("Invalid answer request."), {
      code: "VALIDATION",
    });
  }
  const selected = String(answer).trim().toUpperCase();

  return db.transaction(async (tx) => {
    const attempt = await tx.get(
      "SELECT id, completed_at FROM quiz_attempts WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [attemptId, userId],
    );
    if (!attempt)
      throw Object.assign(new Error("Quiz attempt not found."), {
        code: "NOT_FOUND",
      });
    if (attempt.completed_at)
      throw Object.assign(new Error("Quiz has already been completed."), {
        code: "COMPLETED",
      });

    const question = await tx.get(
      `SELECT q.id, q.answer, q.difficulty
       FROM questions q JOIN attempt_questions aq ON aq.question_id = q.id
       WHERE aq.attempt_id = $1 AND q.id = $2`,
      [attemptId, questionId],
    );
    if (!question)
      throw Object.assign(new Error("Question does not belong to this quiz."), {
        code: "FORBIDDEN",
      });

    const duplicate = await tx.get(
      "SELECT id FROM quiz_answers WHERE attempt_id = $1 AND question_id = $2",
      [attemptId, questionId],
    );
    if (duplicate)
      throw Object.assign(new Error("Question has already been answered."), {
        code: "DUPLICATE",
      });

    const correct = selected !== "TIMEOUT" && question.answer === selected;
    const points = correct ? POINTS[question.difficulty] : 0;
    const xp = correct ? XP[question.difficulty] : 0;

    await tx.run(
      `INSERT INTO quiz_answers(attempt_id, question_id, selected_answer, correct, points, xp)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [attemptId, questionId, selected, correct, points, xp],
    );

    return {
      correct,
      points,
      xp,
      correctAnswer: question.answer,
      selectedAnswer: selected,
    };
  });
}

async function completeQuiz(db, userId, attemptId) {
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    throw Object.assign(new Error("Invalid quiz attempt."), {
      code: "VALIDATION",
    });
  }

  return db.transaction(async (tx) => {
    const attempt = await tx.get(
      `SELECT id, total_questions, completed_at
       FROM quiz_attempts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [attemptId, userId],
    );
    if (!attempt)
      throw Object.assign(new Error("Quiz attempt not found."), {
        code: "NOT_FOUND",
      });
    if (attempt.completed_at)
      throw Object.assign(new Error("Quiz has already been completed."), {
        code: "COMPLETED",
      });

    const totals = await tx.get(
      `SELECT COUNT(*)::int AS answered,
              COUNT(*) FILTER (WHERE correct)::int AS correct,
              COALESCE(SUM(points),0)::int AS score,
              COALESCE(SUM(xp),0)::int AS xp
       FROM quiz_answers WHERE attempt_id = $1`,
      [attemptId],
    );

    await tx.run(
      `UPDATE quiz_attempts
       SET correct_answers = $1, score = $2, xp_earned = $3, completed_at = NOW()
       WHERE id = $4`,
      [totals.correct, totals.score, totals.xp, attemptId],
    );

    await tx.run(
      "UPDATE users SET score = score + $1, xp = xp + $2 WHERE id = $3",
      [totals.score, totals.xp, userId],
    );

    return {
      attemptId,
      answered: totals.answered,
      totalQuestions: attempt.total_questions,
      correctAnswers: totals.correct,
      score: totals.score,
      xp: totals.xp,
    };
  });
}

async function history(db, userId) {
  return db.all(
    `SELECT id, category, total_questions, correct_answers, score, xp_earned, started_at, completed_at
     FROM quiz_attempts WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20`,
    [userId],
  );
}

async function result(db, userId, attemptId) {
  const attempt = await db.get(
    `SELECT id, category, total_questions, correct_answers, score, xp_earned, started_at, completed_at
     FROM quiz_attempts WHERE id = $1 AND user_id = $2`,
    [attemptId, userId],
  );
  if (!attempt)
    throw Object.assign(new Error("Quiz result not found."), {
      code: "NOT_FOUND",
    });

  const answers = await db.all(
    `SELECT qa.question_id, qa.selected_answer, qa.correct, qa.points, qa.xp,
            q.question, q.difficulty
     FROM quiz_answers qa JOIN questions q ON q.id = qa.question_id
     WHERE qa.attempt_id = $1 ORDER BY qa.id`,
    [attemptId],
  );
  return { attempt, answers };
}

async function categories(db) {
  return db.all(
    `SELECT category AS name, COUNT(*)::int AS "questionCount"
     FROM questions GROUP BY category ORDER BY category`,
  );
}

module.exports = {
  startQuiz,
  answerQuestion,
  completeQuiz,
  history,
  result,
  categories,
  normalizeCategory,
  normalizeDifficulty,
  isAnswer,
};
