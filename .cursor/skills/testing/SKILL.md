---
name: testing
description: Write or run unit tests with Vitest in this project. Use when adding tests, setting up the test harness, or when asked whether a change is covered by tests.
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "vitest.config.*"
---

# Testing with Vitest

Vitest is **not installed in this starter**. Set it up the first time tests are needed.

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom vite-tsconfig-paths
```

Add a `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

`vite-tsconfig-paths` is what makes the `@/` alias resolve in tests. Without it every
import of `@/lib/...` fails.

Then add the scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

## What makes a test worth writing

- A test exists to prove behavior is correct, not to make the suite green.
- Never write assertions like `expect(true).toBe(true)`, and never write a test whose
  assertions cannot fail. If the behavior is hard to assert, say so rather than
  producing a hollow test.
- Assert on observable output and side effects, not on internal implementation details.
- Cover the failure paths, not just the happy path. Validation rejections, missing
  records, and permission failures are usually where the real bugs are.
- Name tests so a failure message alone explains what broke.

## Structure

- Colocate tests with their subject: `src/lib/format.ts` is tested by
  `src/lib/format.test.ts`.
- Each test must pass when run alone. Never rely on ordering or on state left behind by
  an earlier test.
- Reset mocks between tests:

```ts
beforeEach(() => {
  vi.clearAllMocks();
});
```

## Mocking

Mock at the module boundary with `vi.mock`. Never let a unit test reach a real network
service, a real database, or a real model provider.

Server-only modules need stubbing before they can be imported in a test:

```ts
vi.mock("server-only", () => ({}));
```

## Testing code that touches Cloudflare bindings

`getCloudflareContext()` does not work under jsdom. Mock it and supply a fake `env`:

```ts
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));
```

Keep D1 access behind a module in `src/lib/` so tests mock that one module rather than
reconstructing the whole D1 prepared-statement chain.

If you need to exercise real Workers runtime behavior rather than mock it, that requires
`@cloudflare/vitest-pool-workers` and a different config. Raise it with the user before
introducing it, since it changes how the whole suite runs.

## React components

Render with `@testing-library/react` and assert against what a user can perceive:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

Query by role and accessible name (`screen.getByRole("button", { name: /save/i })`)
rather than by test IDs or class names. Prefer `userEvent` over `fireEvent`, since it
models real interaction more faithfully.

Server Components cannot be rendered by Testing Library. Test their data-fetching logic
directly as plain functions, and reserve component rendering for client components.
