require("dotenv").config();

const app = require("./app");
const db = require("./config/database");
const { PORT, QUESTION_REFRESH_ENABLED } = require("./config/env");
const { prepareQuestionBank } = require("./services/questionService");

let server;

async function start() {
  await db.migrate();
  const bank = await prepareQuestionBank(db, QUESTION_REFRESH_ENABLED);
  console.log(`[questions] imported ${bank.imported} new internet questions`);

  const refreshTimer = setInterval(
    async () => {
      if (!QUESTION_REFRESH_ENABLED) return;
      try {
        const result = await prepareQuestionBank(db, true);
        if (result.imported)
          console.log(
            `[questions] background refresh imported ${result.imported} new questions`,
          );
      } catch (error) {
        console.warn(`[questions] background refresh failed: ${error.message}`);
      }
    },
    6 * 60 * 60 * 1000,
  );
  refreshTimer.unref?.();

  server = app.listen(PORT, () => {
    console.log(`BattleBrain listening on http://localhost:${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully...`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch(async (error) => {
  console.error("Startup failed:", error);
  await db.close();
  process.exit(1);
});
