# AGENTS.md

Guidance for coding agents working in the `structured-log-service` repository.

## Scope and intent

- Node.js / TypeScript service repository.
- `mise` is the source of truth for local workflows and CI command parity.
- Keep changes small, direct, and easy to review.

## Boundaries

### Always

- Run `mise run check` before handoff.
- Start behavior changes with a failing test.
- Validate external input (env vars, HTTP bodies, file contents) with `zod` at the boundary.
- Keep changes focused on one logical concern.

### Ask first

- Adding a new runtime dependency.
- Changing CI workflow, `mise.toml` tasks, or Husky hooks.
- Touching cross-cutting setup (`src/observability/`, `src/telemetry/`, top-level wiring).

### Never

- Commit secrets, credentials, or `.env` contents.
- Reference files inside `specs/` from `src/` or `test/` (including comments) — `specs/` is `.gitignore`d, so the reference dangles for anyone without the local working copy. Restate the constraint inline instead.
- Skip Husky hooks (`--no-verify`) or bypass `mise run check`.
- Mix unrelated refactors or tooling churn into a focused change.

## Source-of-truth files

- Local workflows and CI-equivalent commands: `mise.toml`.
- CI checks and Docker publishing: `.github/workflows/ci.yml`.
- Contributor and setup overview: `README.md`.
- Container packaging: `Dockerfile`.
- Lint/format/typecheck rules: `eslint.config.mjs`, `.prettierrc.json`, `tsconfig.json`.

## Toolchain and environment

- Node.js 24 LTS, pnpm — both pinned in `mise.toml`.
- Prefer an activated `mise` shell so `node` and `pnpm` resolve from the project toolchain.
- If `mise` is unavailable, use Corepack only as a bootstrap fallback.

## Build, lint, and test commands

Mirror these in CI; do not invent equivalents.

### Install

- `mise run install` — install tools and dependencies.

### Quality checks

- `mise run check` — full default check (lint + format check + typecheck).
- `mise run lint` — lint only.
- `mise run format` — apply formatting.
- `mise run format:check` — formatting check, no writes.
- `mise run typecheck` — typecheck only.

### Build and run

- `mise run build` — compile to `dist/`.
- `mise run dev` — local dev server on port `3003`.

### Tests

- `mise run test` — full suite.
- `mise run test:unit` — fast isolated tests in `test/unit`.
- `mise run test:integration` — subsystem boundary tests in `test/integration`.
- `mise run test:e2e` — live HTTP / process-level smoke flows in `test/e2e`.
- `mise run test:mutate` — mutation testing; must stay at or above CI threshold `70%`.

### Docker

- `mise run docker:build` — build local image.

## Coding style

ESLint, Prettier, and `tsc --strict` enforce formatting, semicolons, quotes, line length, and unsafe-any rules. Do not re-litigate those here. The rules below cover what tooling cannot enforce.

### Naming

- Files: `kebab-case.ts` (matches `root-route.test.ts`, `logger.ts`). Test files end in `.test.ts`.
- Identifiers: `camelCase` for functions and variables, `PascalCase` for types/interfaces/classes, `SCREAMING_SNAKE_CASE` only for env-var keys at the boundary.
- Verbs for functions, nouns for data: `parseConfig(env)` returns `config`; `buildLogger(config)` returns `logger`.
- Booleans read as predicates: `isReady`, `hasTracing`, `shouldRetry`. Never `flag`, `status`, or `done` alone.
- Idiomatic abbreviations only: `req`, `res`, `id`, `url` are fine; `usrCfgMgr` is not.

```ts
// Good
export function buildLoggerFromEnv(env: Env): Logger { ... }

// Bad — name hides intent, type leaks `any`, return inferred from junk
export function init(x: any) { ... }
```

### Comments

- Default to **no comments**. Well-named identifiers carry the _what_.
- Write a comment only when the _why_ is non-obvious: a hidden constraint, a workaround for a specific upstream bug, a surprising invariant.
- Never restate code (`// increment i`). Never link to tickets, PRs, or `specs/` files — those rot or dangle.
- JSDoc only on exported APIs where the type signature alone does not convey intent.

### Functions and files

- Target: functions ≤30 lines, files ≤300 lines. Hard ceiling: 800 lines.
- Maximum nesting depth: 3. Prefer early returns over nested `if`.
- One exported concept per file; co-locate private helpers below the export.
- Pure functions where practical: same inputs → same outputs, no hidden I/O.

### Types and validation

- Prefer TypeScript inference for local variables and obvious return types.
- Add explicit return types on exported functions and module boundaries.
- Parse external input through `zod` schemas at the boundary; internal code trusts the validated type and does not re-check.

### Error handling

- Throw on programmer errors and invariant violations. Return result-style values only when a caller can meaningfully recover.
- Error messages name the failing input and expected shape: `Invalid PORT: expected number ≥ 1, got "abc"`.
- Never swallow errors silently. If an error is intentionally ignored, write one comment explaining why — this is the rare case where a comment earns its keep.
- Keep startup and configuration failures loud and explicit.

### Refactoring

- Refactor during the green step of TDD, not before tests pass.
- Trigger a refactor when you see duplication across three call sites, a function pushing past 30 lines, or a name that needs a comment to explain.
- A refactor must not change behavior. If a test changes, it's a behavior change — split the commit.

## Testing conventions

- **TDD is mandatory** for behavior changes, bug fixes, and non-trivial logic: write or update a failing test first, then make it pass with the smallest change, then refactor.
- Trivial edits may skip TDD: renames, formatting, comments, pure code moves, dependency version bumps.
- Do not stop at green. After tests pass, refactor for clarity and duplication; rerun tests.
- Follow the testing pyramid: most tests in `test/unit`, fewer in `test/integration`, sparse and high-signal in `test/e2e`.
- Test naming: `describe('parseConfig', () => { it('rejects PORT below 1', ...) })` — the outer block names the unit, the inner names one observable behavior.
- One behavior per test. Group assertions only if they describe the same behavior.
- Test the public boundary of the module. If a private helper needs its own test, promote it to an exported function in its own file.
- Shared fixtures and utilities live in `test/helpers/`. Do not deepen `test/unit` with shared setup.
- Run `mise run test:mutate` after non-trivial `src/` logic changes; skip for type-only or test-only edits. Keep mutation score ≥70%.

## Git hooks and commit messages

- Husky `pre-commit` runs `lint-staged` (Prettier + ESLint autofix on staged files).
- Husky `pre-push` runs `mise run check` and `mise run test:unit`.
- Use conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`). Not auto-enforced, but expected.

## Change checklist

1. Write or update a failing test (skip only for trivial edits listed above).
2. Implement the minimum needed to pass.
3. Run `mise run check` and the targeted test file.
4. Refactor for clarity; rerun tests.
5. Run `mise run test` for broad changes; `mise run test:mutate` for non-trivial `src/` logic.
6. Update `README.md` when setup, workflows, or developer commands change.
