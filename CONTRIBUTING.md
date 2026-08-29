# Contributing to BattleBrain

Thanks for contributing.

## Workflow

1. Fork the repository and create a focused branch.
2. Keep changes small and explain architectural decisions in the pull request.
3. Run the full local checks before opening a PR:
   ```bash
   npm test
   npm run lint
   npm run format:check
   ```
4. Update tests and documentation when behavior changes.
5. Never commit `.env`, credentials, generated session databases, or database WAL/SHM files.

## Engineering standards

- Prefer small modules with one clear responsibility.
- Keep HTTP concerns in `src/app.js`; put business rules in services.
- Validate all external input at the boundary.
- Never trust client-provided correctness, score, XP, ownership, or authorization.
- Use parameterized SQL.
- Use transactions for multi-step state changes.
- Do not add a dependency when the platform or existing code can solve the problem cleanly.
- Avoid breaking API changes unless documented.

## Pull requests

A good PR includes:

- What changed and why.
- Security or performance implications.
- Tests/checks performed.
- Migration notes if the database schema changed.
- Screenshots for user-facing changes when useful.

## Commit messages

Use concise imperative messages, for example:

- `feat: add timed quiz mode`
- `fix: prevent duplicate reward`
- `refactor: isolate quiz service`
- `docs: improve deployment guide`

## Reporting security issues

Do not publish exploitable security details in a public issue. Contact the repository maintainers privately and include reproduction steps and impact.
