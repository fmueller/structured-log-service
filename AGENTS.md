# AGENTS.md

Guidance for coding agents working in the `structured-log-service` repository.

## Scope and intent

- This is a Node.js / TypeScript service repository.
- Use `mise` as the source of truth for local workflows and CI command parity.
- Keep changes small, direct, and easy to review.

## Source-of-truth files

- Project specification and repository conventions: `spec.md`.
- Local workflows and CI-equivalent commands: `mise.toml`.
- CI checks and Docker publishing: `.github/workflows/ci.yml`.
- Contributor and setup overview: `README.md`.
- Container packaging: `Dockerfile`.

## Toolchain and environment

- Node.js version is managed in `mise.toml`.
- Current baseline: Node.js 24 LTS.
- Package manager: `pnpm`.
- Prefer commands that mirror CI.
- For interactive local work, prefer an activated `mise` shell so `node` and `pnpm` resolve from the project toolchain automatically.
- If `mise` is not available locally, use Corepack only as a bootstrap fallback.

## Build, lint, and test commands

Use these defaults unless a task requires otherwise.

### Install

- Install tools and dependencies: `mise run install`

### Quality checks

- Run the full default check: `mise run check`
- Run lint only: `mise run lint`
- Run formatting fix: `mise run format`
- Run formatting check: `mise run format:check`
- Run typecheck: `mise run typecheck`

### Build

- Build the project: `mise run build`

### Tests

- Run the full test suite: `mise run test`
- Run unit tests: `mise run test:unit`
- Run integration tests: `mise run test:integration`
- Run e2e tests: `mise run test:e2e`

### Mutation tests

- Run mutation testing: `mise run test:mutate`
- Mutation score must stay at or above the CI threshold of `70%`.

### Docker

- Build the local image: `mise run docker:build`

## Coding style guidelines

### Formatting and structure

- Always run `mise run check` after every code change.
- Keep functions focused and prefer direct code over unnecessary abstraction.
- Follow the existing file and folder layout unless there is a clear reason to change it.
- Do not reference files inside `specs/` from source code or tests (including comments). The `specs/` folder is `.gitignore`d, so any such reference is a dangling pointer for anyone without the local working copy. If a constraint or rationale matters at the code site, restate it inline.

### Naming and types

- Use descriptive names and keep exported APIs small.
- Prefer TypeScript inference for local variables and obvious return types.
- Add explicit return types where they clarify exported APIs, module boundaries, or otherwise non-obvious behavior.
- Use `zod` for runtime validation when validating configuration or external input.

### Error handling

- Throw or return actionable errors.
- Avoid silent failure paths.
- Keep startup and configuration failures explicit.

## Testing conventions

- For any behavior change, bug fix, or non-trivial logic change, follow TDD: start by writing or updating a test that fails for the intended change.
- Follow the red, green, refactor cycle explicitly: make the smallest production change needed to get the test green, then perform a refactoring pass after the tests pass.
- Do not stop at green. After tests pass, refactor for clarity, duplication removal, and simplicity without changing behavior.
- After refactoring, rerun the relevant tests to confirm behavior still passes.
- Trivial or purely mechanical edits that do not change behavior, such as renames, comments, or formatting-only changes, may skip TDD.
- Follow the testing pyramid: default to unit tests, add integration tests for subsystem boundaries, and keep e2e tests sparse and high-signal.
- `test/unit` is for fast isolated tests.
- `test/integration` is for subsystem boundary tests.
- `test/e2e` is for live HTTP or process-level smoke flows.
- `test/helpers` is for shared test utilities and fixtures.
- Run mutation testing after code changes and keep the score above the CI threshold.

## Git hooks and commit guidance

- Husky hooks are part of the repository setup.
- `pre-commit` runs staged-file formatting and lint autofixes through `lint-staged`.
- `pre-push` runs `mise run check` and unit tests.
- Use conventional commit messages.
- Conventional commits are documented, not automatically enforced.

## Change checklist for agents

- For behavior changes, bug fixes, and non-trivial logic changes, start with a failing test before changing production code.
- Make the smallest change needed to get the relevant tests green, then complete a refactoring pass before handoff.
- Rerun the relevant tests after refactoring.
- Run `mise run check` on every code change.
- Run targeted tests for touched areas.
- Run `mise run test` before handing off broad changes.
- Run `mise run test:mutate` after non-trivial logic changes.
- Keep mutation testing at or above the CI threshold of `70%`.
- Update `README.md` when setup, workflows, or developer commands change.
- Update `spec.md` only when explicitly changing the project specification.

## Agent do/don'ts

- Do keep changes focused on one logical concern.
- Do keep CI, local commands, and docs aligned.
- Do use conventional commit messages.
- Don't mix unrelated refactors or tooling churn into focused changes.
- Don't bypass CI-equivalent checks before asking for review.
- Don't add heavyweight tooling unless it has a clear purpose in this repository.
