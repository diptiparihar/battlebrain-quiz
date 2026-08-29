const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const { pool } = require("./database");

const PgStore = connectPgSimple(session);

module.exports = new PgStore({
  pool,
  tableName: "sessions",
  createTableIfMissing: false,
  pruneSessionInterval: 15 * 60,
});
