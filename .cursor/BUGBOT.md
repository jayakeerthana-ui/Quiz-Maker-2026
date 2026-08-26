# Bugbot Review Rules

Project rules in `.cursor/rules/` do not apply to Bugbot, so the conventions that matter
at review time are restated here.

## Stack context

Next.js 16 App Router on Cloudflare Workers via OpenNext, React 19, Tailwind v4,
shadcn/ui on Base UI, TypeScript strict.

## Secrets and configuration

- Flag any hard-coded API key, token, account ID, or connection string.
- Flag any secret added to `wrangler.jsonc`. Secrets belong in `.dev.vars` locally and
  `wrangler secret put` in production.
- A new environment variable should come with a placeholder in `.dev.vars.example`.
  Flag when it does not.
- Flag edits to generated files: `cloudflare-env.d.ts`, `next-env.d.ts`.

## Cloudflare Workers correctness

- Flag Node built-ins that do not work on Workers, especially `fs`, `path` used for disk
  access, and native modules.
- Flag reliance on `process.env` for runtime secrets. On Workers, values come from the
  binding environment via `getCloudflareContext()`.
- Flag module-level mutable state used as a cache. Worker isolates are not a reliable
  place to keep state between requests.

## Server and client boundaries

- Flag server-only code imported into a file marked `'use client'`, especially database
  access and anything reading secrets.
- Flag `'use client'` added to a component that has no state, effects, or event handlers.
- Flag secrets or full database records passed as props into client components. Only
  pass what the client actually renders.

## Data access

- Flag SQL built by string concatenation or template literals containing user input.
  Queries must use bound parameters.
- Flag schema changes made outside a migration file.
- Flag any command applying migrations to a remote database.

## Input validation

- Server Actions and route handlers must validate their input with a Zod schema before
  use. Flag handlers that read `await req.json()` and use the result unvalidated.
- Flag `any` used to bypass validation of external input.

## UI

- Flag raw `<button>`, `<input>`, or `<table>` where an existing component in
  `src/components/ui/` should be used.
- Flag hard-coded colors such as `bg-[#171717]` instead of theme tokens like
  `bg-background`. These break dark mode.
- Flag a new `tailwind.config.ts`. Tailwind v4 is configured in `src/app/globals.css`.

## Tests

- Flag tests that cannot fail, such as `expect(true).toBe(true)`.
- Flag tests that reach real networks, databases, or model providers.
