# structured-log-service

`structured-log-service` is a small Node.js and TypeScript service built with Express. It provides a simple HTTP endpoint and serves as a clean starting point for services that emit structured logs.

## Installation

This project uses Node.js 24 and `pnpm`.

If you use `mise`, install the project tools and dependencies with:

```sh
mise trust
mise install
mise run install
```

If you already have Node.js 24 and `pnpm` available locally, you can install dependencies with:

```sh
pnpm install
```

## Usage

Start the development server:

```sh
mise run dev
```

By default, the service listens on port `3003`.

You can verify it is running with:

```sh
curl http://localhost:3003/
```

Expected response:

```json
{
  "name": "structured-log-service",
  "status": "ok"
}
```

To build and run the production output:

```sh
mise run build
pnpm start
```

## Configuration

The service currently supports the following environment variable:

- `PORT`: HTTP port for the server. Defaults to `3003`.

Example:

```sh
PORT=4000 pnpm start
```

## Docker

Build the local Docker image with:

```sh
mise run docker:build
```

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
