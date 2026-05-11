# structured-log-service

Structured log service built with Node.js and TypeScript.

## Goals

- Start from the provided Express + TypeScript starter project.
- Use `mise` as the canonical local workflow entrypoint.
- Standardize on `pnpm` for package management.
- Enforce formatting, linting, typechecking, tests, Docker builds, and mutation testing through shared commands and CI.
- Keep local workflows, CI, and container packaging aligned.

## Tooling

- Node.js 24 LTS via `mise`
- `pnpm`
- TypeScript
- Express
- Vitest
- ESLint
- Prettier
- Husky + lint-staged
- StrykerJS

## Getting Started

1. Install `mise`: <https://mise.jdx.dev/getting-started.html>
2. Activate `mise` in your shell. For `zsh`:

```sh
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
exec zsh
```

3. Trust the project config: `mise trust`
4. Install tools and dependencies: `mise run install`
5. Start the app: `mise run dev`

If you skip shell activation, the project still works through explicit `mise run ...` commands, but `node` and `pnpm` will not automatically resolve from the project `mise` toolchain in your shell.

If `mise` is unavailable locally, you can bootstrap with Corepack:

```sh
corepack enable
corepack pnpm install
```

## Common Commands

- `mise run check`: lint, formatting check, and typecheck
- `mise run test`: run unit, integration, and e2e tests
- `mise run test:mutate`: run Stryker mutation testing
- `mise run build`: compile TypeScript to `dist/`
- `mise run docker:build`: build the Docker image locally

Mutation testing is currently scoped to the HTTP entry surface and can expand with additional application logic.

The production container uses a multi-stage Docker build with a separate runtime image, production-only dependencies, a non-root runtime user, and `dumb-init` for safer PID 1 behavior.

## Test Layout

- `test/unit`: fast isolated tests
- `test/integration`: subsystem boundary tests
- `test/e2e`: thin HTTP smoke flows
- `test/helpers`: shared test utilities

This follows the testing pyramid documented in `AGENTS.md`.

## Git Hooks

Hooks are installed through `husky` during dependency installation.

- `pre-commit`: runs Prettier and ESLint fixes on staged files via `lint-staged`
- `pre-push`: runs `mise run check` and unit tests

Mutation testing remains a CI-authoritative gate instead of a local hook.

## Docker

Build locally with:

```sh
mise run docker:build
```

CI always builds the Docker artifact. Pushes to `main` and version tags also publish the image to `ghcr.io`.

## Project Scope

This repository includes:

- the HTTP service baseline
- project tooling and quality gates
- test structure and baseline coverage
- CI and Docker packaging setup
- project documentation and specification

See `spec.md` for the project specification.
