# Contributing to Lyraxc

Thanks for your interest in improving Lyraxc! This project follows a clean,
layered architecture — please keep changes within the appropriate layer.

## Development setup

```bash
npm install
cp .env.example .env
npm test
```

## Quality gates

Before opening a pull request, make sure all of these pass:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

## Architecture rules

- **Domain** (`src/domain`) must not import from `application`, `infrastructure`
  or `interface`.
- **Application** (`src/application`) depends only on **domain ports**, never on
  concrete adapters.
- New external integrations belong in **infrastructure** as adapters that
  implement a domain **port**, then wired in `src/container.ts`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add screenshot-diff action
fix: handle empty selector list in observation
docs: clarify LLM configuration
test: cover start-url failure path
chore: bump dependencies
```

## Adding a new action

1. Add its Zod schema to `src/domain/actions.ts`.
2. Handle it in `PlaywrightSession.dispatch` (`src/infrastructure/browser`).
3. Optionally teach the planner(s) to emit it.
4. Add unit tests in `tests/`.

## Responsible automation

Only add features and examples that automate sites you are permitted to use.
Respect Terms of Service and `robots.txt`.
