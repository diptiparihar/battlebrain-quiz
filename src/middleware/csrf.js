const crypto = require("node:crypto");

function csrfToken(req) {
  if (!req.session.csrfToken)
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const supplied = req.get("x-csrf-token") || req.body?._csrf;
  if (!supplied || supplied !== req.session.csrfToken) {
    return res
      .status(403)
      .json({ success: false, message: "Invalid CSRF token." });
  }
  next();
}

module.exports = { csrfToken, csrfProtection };
