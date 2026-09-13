# BattleBrain Quiz

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**BattleBrain** is a production-oriented real-time quiz platform built with Node.js, Express, EJS, vanilla JavaScript and PostgreSQL.

It is designed around one principle: **the browser is a UI, never the authority**. Questions, correctness, scoring, XP and completion are verified on the server.

## What makes this version different

- PostgreSQL instead of a local SQLite file: suitable for large question banks, concurrent users and managed cloud databases.
- Automatic internet question ingestion from Open Trivia DB at startup.
- Local fallback questions keep the app usable when the provider is unavailable.
- Imported questions are persisted and deduplicated; the app does not need to download the same question repeatedly.
- Server-side attempt/question binding prevents clients from changing the question set.
- Correct answers are never sent before the player answers.
- After answering, the server returns the authoritative correct option so the UI can clearly show **green = correct** and **red = selected wrong**.
- Accessible, high-contrast answer states and visible A/B/C/D keys make results easy to read.
- PostgreSQL transactions prevent duplicate rewards.
- Persistent PostgreSQL session store.
- CSRF protection, Helmet, rate limiting, secure cookies and strict request limits.
- CI, ESLint, Prettier, Husky and a Docker Compose production-like environment.

## Architecture

```mermaid
flowchart TD
    Browser["Browser<br/>EJS + Vanilla JS"] -->|HTTPS| Express["Express API / Web"]
    Express --> Auth["Authentication"]
    Express --> Quiz["Quiz Service"]
    Express --> Security["Helmet + CSRF + Rate Limits"]
    Quiz --> Attempts["Quiz Attempts"]
    Quiz --> Questions["Question Bank"]
    Questions --> PostgreSQL[("PostgreSQL")]
    Attempts --> PostgreSQL
    Auth --> PostgreSQL
    Express --> Sessions["PostgreSQL Session Store"]
    Sessions --> PostgreSQL
    Worker["Question Ingestion"] -->|Open Trivia DB| Internet["Internet Question Provider"]
    Worker --> PostgreSQL
```

## Data flow

```text
Start quiz
   ↓
Select 15 questions from PostgreSQL
   ↓
Create server-side attempt_questions
   ↓
Send question + options only
   ↓
Player answers
   ↓
Server verifies attempt ownership + question membership
   ↓
Server checks answer
   ↓
Return correct/incorrect + correct option
   ↓
UI highlights:
  green = correct
  red = selected wrong
   ↓
Complete transaction
   ↓
Award score + XP exactly once
```

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (17 recommended; 18 supported)
- Internet access for automatic question ingestion

## Windows 11 — easiest setup

### Option A: Docker Desktop

Install Docker Desktop, then from the project folder:

```powershell
docker compose up --build
```

Open:

```text
http://localhost:3000
```

This starts PostgreSQL and BattleBrain together.

### Option B: Local PostgreSQL + Node

Create a PostgreSQL database named `battlebrain`, then:

```powershell
npm install
Copy-Item .env.example .env
```

Put your PostgreSQL connection string in `.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/battlebrain
SESSION_SECRET=replace-with-a-long-random-secret
```

Then:

```powershell
npm start
```

## Automatic question bank

On startup BattleBrain contacts Open Trivia DB and imports multiple-choice questions into PostgreSQL.

Current mapping:

| BattleBrain zone | Provider category |
| ---------------- | ----------------- |
| WebDev           | Computers         |
| Science          | Science & Nature  |
| Logic            | Mathematics       |

The imported questions are stored permanently and deduplicated by provider/source identifier. This means your database can grow from the small bundled fallback set to **a large, persistent question bank** over repeated refreshes.

The provider is treated as an ingestion source, not as the runtime database. A temporary internet/API outage therefore does not erase your stored question bank.

For a commercial-scale deployment, keep the ingestion interface and add a scheduled worker plus one or more licensed/proprietary question providers so the platform is not dependent on one public API.

## API

All state-changing requests require the CSRF token.

### `POST /api/quiz/start`

```json
{
  "category": "Science",
  "difficulty": "medium"
}
```

Creates an attempt and returns questions without answers.

### `POST /api/quiz/:attemptId/answer`

```json
{
  "questionId": 123,
  "answer": "B"
}
```

Returns:

```json
{
  "correct": true,
  "points": 15,
  "xp": 15,
  "correctAnswer": "B",
  "selectedAnswer": "B"
}
```

### `POST /api/quiz/:attemptId/complete`

Atomically calculates and awards the attempt's final score and XP.

### `GET /api/quiz/history`

Returns the authenticated user's recent completed attempts.

### `GET /api/quiz/:attemptId/result`

Returns a result only for the owner of the attempt.

### `GET /api/categories`

Returns available zones and their current question counts.

### `GET /api/profile`

Returns the authenticated player's profile.

### `GET /api/leaderboard?limit=10`

Returns the global leaderboard.

### `GET /health`

Checks application and PostgreSQL availability for load balancers.

## Security

- bcrypt password hashing
- session ID regeneration after authentication
- PostgreSQL-backed sessions
- CSRF protection
- Helmet security headers
- restrictive CSP
- API/authentication rate limits
- strict JSON/form body limits
- parameterized SQL
- authorization checks on every quiz attempt
- server-authoritative scoring
- transactional reward calculation
- no answer keys in the initial quiz payload
- no secrets or databases committed to Git

## Production deployment

Set:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=<strong-random-secret>
TRUST_PROXY=true
QUESTION_REFRESH_ENABLED=true
```

Use a managed PostgreSQL service such as Neon, Supabase, Render PostgreSQL, AWS RDS, Railway PostgreSQL or your organization's database platform.

For multiple app instances:

```text
              Load Balancer
                    |
          +---------+---------+
          |         |         |
       App #1    App #2    App #3
          |         |         |
          +---------+---------+
                    |
              PostgreSQL
```

Because sessions and application state are stored in PostgreSQL, the app does not depend on process-local memory.

## Development

```powershell
npm test
npm run lint
npm run format:check
npm run dev
```

Pre-commit hooks run the quality checks before a commit.

## Deployment checklist

- [ ] Use a managed PostgreSQL database.
- [ ] Generate a unique strong `SESSION_SECRET`.
- [ ] Set `NODE_ENV=production`.
- [ ] Put the service behind HTTPS.
- [ ] Configure `TRUST_PROXY` only when appropriate.
- [ ] Configure database backups and point-in-time recovery.
- [ ] Configure health checks against `/health`.
- [ ] Monitor application and database metrics.
- [ ] Keep `.env` and credentials out of Git.
- [ ] Review the question provider's terms before commercial launch.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
