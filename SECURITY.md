# Security Policy

## Supported versions

Only the latest version on the default branch is actively supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.

Until a private security contact is configured for this repository, report responsibly through the repository owner's GitHub security advisory workflow. Include reproduction steps, affected endpoints/files, impact, and any suggested mitigation.

Never include passwords, session secrets, database credentials, or personal data in a report.

## Security baseline

BattleBrain uses server-side scoring, parameterized SQL, bcrypt password hashing, CSRF protection, secure session cookies, rate limiting, Helmet security headers, request-size limits, and authorization checks around quiz attempts.

Production deployments must use HTTPS, a strong unique `SESSION_SECRET`, managed PostgreSQL credentials, restricted database network access, and secrets stored outside Git.
