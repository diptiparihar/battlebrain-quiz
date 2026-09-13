const FALLBACK_QUESTIONS = [
  [
    "HTML stands for?",
    "HyperText Markup Language",
    "HighTech Machine Language",
    "Hyperlink Text Management Language",
    "Home Tool Markup Language",
    "A",
    "WebDev",
    "easy",
  ],
  [
    "Which CSS property changes text color?",
    "font-color",
    "text-color",
    "color",
    "foreground",
    "C",
    "WebDev",
    "easy",
  ],
  [
    "Which HTTP method is commonly used to retrieve data?",
    "POST",
    "GET",
    "PUT",
    "DELETE",
    "B",
    "WebDev",
    "easy",
  ],
  [
    "Which status code means Not Found?",
    "200",
    "301",
    "404",
    "500",
    "C",
    "WebDev",
    "medium",
  ],
  [
    "What does API stand for?",
    "Application Programming Interface",
    "Advanced Program Integration",
    "Application Process Internet",
    "Automated Programming Interface",
    "A",
    "WebDev",
    "medium",
  ],
  [
    "Which planet is known as the Red Planet?",
    "Venus",
    "Mars",
    "Saturn",
    "Neptune",
    "B",
    "Science",
    "easy",
  ],
  [
    "What is the chemical formula for water?",
    "CO2",
    "O2",
    "H2O",
    "NaCl",
    "C",
    "Science",
    "easy",
  ],
  [
    "Who formulated the laws of motion?",
    "Albert Einstein",
    "Isaac Newton",
    "Galileo Galilei",
    "Nikola Tesla",
    "B",
    "Science",
    "medium",
  ],
  [
    "What is the SI unit of force?",
    "Joule",
    "Watt",
    "Newton",
    "Pascal",
    "C",
    "Science",
    "medium",
  ],
  [
    "Which particle has a negative electric charge?",
    "Proton",
    "Neutron",
    "Electron",
    "Nucleus",
    "C",
    "Science",
    "medium",
  ],
  ["2 + 2 × 2 = ?", "8", "6", "4", "10", "B", "Logic", "easy"],
  [
    "What comes next: 2, 4, 8, 16, ?",
    "20",
    "24",
    "32",
    "64",
    "C",
    "Logic",
    "easy",
  ],
  ["Which number is even?", "3", "7", "11", "12", "D", "Logic", "easy"],
  [
    "A clock shows 3:00. What is the angle between the hands?",
    "30°",
    "60°",
    "90°",
    "180°",
    "C",
    "Logic",
    "medium",
  ],
  [
    "If 5 machines make 5 products in 5 minutes, how long do 100 machines take to make 100 products?",
    "5 minutes",
    "20 minutes",
    "100 minutes",
    "500 minutes",
    "A",
    "Logic",
    "hard",
  ],
];

const SOURCE_CATEGORIES = {
  WebDev: 18, // Open Trivia DB: Computers
  Science: 17, // Open Trivia DB: Science & Nature
  Logic: 19, // Open Trivia DB: Mathematics
};

const CATEGORY_NAMES = Object.keys(SOURCE_CATEGORIES);

function decodeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function shuffledOptions(correct, incorrect) {
  const options = [correct, ...incorrect].map(decodeHtml);
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const letters = ["A", "B", "C", "D"];
  const result = {};
  let answer = "A";
  options.forEach((option, index) => {
    result[letters[index]] = option;
    if (option === decodeHtml(correct)) answer = letters[index];
  });
  return { result, answer };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BattleBrain/3.0" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Question provider returned HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshQuestionBank(db) {
  let imported = 0;
  for (const [category, sourceCategory] of Object.entries(SOURCE_CATEGORIES)) {
    const url = `https://opentdb.com/api.php?amount=50&category=${sourceCategory}&type=multiple`;
    try {
      const payload = await fetchJson(url);
      if (payload.response_code !== 0 || !Array.isArray(payload.results))
        continue;

      for (const item of payload.results) {
        const { result, answer } = shuffledOptions(
          item.correct_answer,
          item.incorrect_answers,
        );
        const difficulty = ["easy", "medium", "hard"].includes(item.difficulty)
          ? item.difficulty
          : "medium";
        const externalId = `${sourceCategory}:${item.question}`;
        const inserted = await db.run(
          `INSERT INTO questions
           (external_id, source, question, opt_a, opt_b, opt_c, opt_d, answer, category, difficulty)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (source, external_id) DO NOTHING`,
          [
            externalId,
            "opentdb",
            decodeHtml(item.question),
            result.A,
            result.B,
            result.C,
            result.D,
            answer,
            category,
            difficulty,
          ],
        );
        imported += inserted.rowCount;
      }
    } catch (error) {
      console.warn(
        `[questions] ${category} internet refresh skipped: ${error.message}`,
      );
    }
  }
  return imported;
}

async function ensureFallbackQuestions(db) {
  for (const [
    question,
    a,
    b,
    c,
    d,
    answer,
    category,
    difficulty,
  ] of FALLBACK_QUESTIONS) {
    const exists = await db.get(
      "SELECT id FROM questions WHERE source = $1 AND question = $2",
      ["local", question],
    );
    if (!exists) {
      await db.run(
        `INSERT INTO questions(source, question, opt_a, opt_b, opt_c, opt_d, answer, category, difficulty)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        ["local", question, a, b, c, d, answer, category, difficulty],
      );
    }
  }
}

async function prepareQuestionBank(db, refreshEnabled = true) {
  await ensureFallbackQuestions(db);
  if (!refreshEnabled) return { imported: 0 };
  const imported = await refreshQuestionBank(db);
  return { imported };
}

module.exports = {
  CATEGORY_NAMES,
  SOURCE_CATEGORIES,
  prepareQuestionBank,
  refreshQuestionBank,
};
