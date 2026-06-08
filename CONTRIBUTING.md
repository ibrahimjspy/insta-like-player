# Contributing

Thanks for your interest in Like Player. This is a small, focused project — contributions
that fix bugs, improve docs, or extend platform export support are especially welcome.

## Before you start

1. Read [README.md](./README.md) for setup and [CLAUDE.md](./CLAUDE.md) for architecture.
2. Open an issue for large changes so we can align on approach first.
3. Only work with **your own** exported data when testing sync/download flows.

## Development setup

```bash
git clone git@github.com:ibrahimjspy/insta-like-player.git
cd insta-like-player
npm install
cp .env.example .env
npm run db:up && npm run db:push
npm run dev
```

You do not need a populated library to run tests — the Vitest suite mocks the database.

## Making changes

- Keep business logic in `src/lib/`; route handlers and components stay thin.
- Add or update unit tests for pure helpers in `src/lib/**/*.test.ts`.
- Run before opening a PR:

  ```bash
  npm run lint
  npm test
  npm run build
  ```

- Touch feed scoring? Also run `npm test -- src/lib/feed` and skim
  [docs/FEED_RECOMMENDATIONS.md](./docs/FEED_RECOMMENDATIONS.md).

## Pull requests

- One logical change per PR when possible.
- Include a short summary and how you tested it.
- Do not commit `.env`, `data/`, cookies, or export JSON files.

## Code style

Match the existing codebase: TypeScript strictness, minimal comments, no drive-by
refactors. Config belongs in `src/lib/config.ts` and `.env.example` — avoid reading
`process.env` elsewhere.

## Security

If you find a vulnerability (path traversal, credential leakage, etc.), please open
a private security advisory on GitHub rather than a public issue.
