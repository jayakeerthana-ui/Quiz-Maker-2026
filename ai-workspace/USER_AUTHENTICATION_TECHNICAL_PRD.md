Date created: 2026-09-01
Date last modified: 2026-09-02

# User Authentication Foundation - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield application for teachers who need to collaborate on a shared bank of multiple-choice questions. This foundation adds a User entity, hashed-password registration and login, and a logout path. After a successful registration or login, the teacher lands on a placeholder MCQ Management page that later sprints will replace with real question tools.

**As of 2026-09-02:** Phases 1–5 are complete on `feature/user-authentication`. D1 is bound, APIs and shadcn UI exist, and register / login (username and email) / logout were verified against D1. Stored `password_hash` values are 64-character hex, not plaintext.

---



## Hypothesis

We believe that a simple, hashed-password registration and login flow will give multiple teachers distinct identities so they can later collaborate on a shared MCQ test bank.

---



## Scope



### In Scope

- Cloudflare D1 database binding and a `users` table migration
- User entity: unique primary key, first name, last name, username (required, unique, may itself be an email address), email (required, unique, must be a valid email), and hashed password
- Registration collects both username and email as required fields
- Login collects only two fields: username or email, then password
- User Service with create, update, retrieve, and delete operations
- Client-side password hashing before the password is sent over HTTP
- Server-side persistence of hashed passwords only (never plaintext)
- Registration, login, and logout HTTP APIs that use the User Service
- Register and login pages, plus logout from the authenticated landing page
- Placeholder MCQ Management page shown after successful registration or login
- Vitest unit tests written with **TDD** in every implementation phase: failing tests first (**red**), then only enough product code to make them pass (**green**)



### Out of Scope

- MCQ create, read, update, delete, and organization (future sprint)
- Social login providers (Google, Microsoft, GitHub, and similar)
- Token-based authentication (JWT)
- Session management, cookies, and other persistent authentication mechanisms
- Email verification, password reset, and account lockout
- Role-based access control (teacher vs admin)
- Remember-me, multi-factor authentication, and OAuth



### Cut

- Cookie or JWT session after login — persistent auth is explicitly out of scope; this phase only establishes identity and a post-auth landing page
- Server-side route guards on `/mcq` — without sessions there is no durable “logged in” signal to check; the page is a stub reached by redirect
- Dedicated password KDF library (bcrypt, Argon2) — Workers-friendly Web Crypto SHA-256 meets the hash-before-transmit and hash-before-store requirements without a new native dependency
- Separate username and email fields on login — after registration, login is a single identifier (username or email) plus password
- Forbidding username from being an email — username may be a plain name or an email address; email remains a distinct required field on the user record
- `@cloudflare/vitest-pool-workers` — unit tests mock D1 and `getCloudflareContext`; a Workers test pool changes how the whole suite runs and is not needed for this phase

---



## Technical Requirements



### Database Schema

Cloudflare D1 is bound as `DB` in `wrangler.jsonc` to database `quiz-maker` (`eea14e86-b327-4629-a4cc-ab6225e01d39`). Worker name is `quiz-maker-2026`. The User table is defined in `migrations/0001_create_users_table.sql`. Apply migrations **locally only** (`--local`). Do not apply them remotely. `env.DB` is typed on `CloudflareEnv` in `cloudflare-env.d.ts:8`.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_username ON users (username);
CREATE UNIQUE INDEX idx_users_email ON users (email);
```


| Column          | Type     | Rules                                                                 |
| --------------- | -------- | --------------------------------------------------------------------- |
| `id`            | TEXT     | Primary key, generated UUID-like hex blob                             |
| `first_name`    | TEXT     | Required, trimmed, 1–100 characters                                   |
| `last_name`     | TEXT     | Required, trimmed, 1–100 characters                                   |
| `username`      | TEXT     | Required, unique, 3–255 characters; may be a plain username or an email address |
| `email`         | TEXT     | Required, unique, valid email format, stored trimmed and lowercased   |
| `password_hash` | TEXT     | Required; SHA-256 hex digest only. Never store plaintext              |
| `created_at`    | DATETIME | Set on insert                                                         |
| `updated_at`    | DATETIME | Set on insert and update                                              |


The User Service must never return `password_hash` to the client.

### API Endpoints

Auth lives in Next.js App Router route handlers under `src/app/api/auth/`. These endpoints are the contract for registration, login, and logout. The UI submits to them after hashing the password on the client.

**File split (required for tests):** Next.js’s TypeScript plugin cannot import App Router `route.ts` from Vitest. Each endpoint is implemented in `handler.ts` and re-exported from `route.ts`:

- `src/app/api/auth/register/handler.ts:6` (`POST`) → `src/app/api/auth/register/route.ts:1`
- `src/app/api/auth/login/handler.ts:8` (`POST`) → `src/app/api/auth/login/route.ts:1`
- `src/app/api/auth/logout/handler.ts:3` (`POST`) → `src/app/api/auth/logout/route.ts:1`

Tests import `./handler`. All mutating endpoints validate the JSON body with Zod in `src/lib/auth-schemas.ts` before calling the User Service. Treat every input as untrusted.

#### POST /api/auth/register

Creates a user and returns the public profile (no password hash).

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "password": "<sha256-hex of the plaintext password>"
}
```

**Behavior:**

1. Validate fields (required, lengths). Username is required (plain text or an email). Email is required and must be a valid email format.
2. Trim username. Normalize email: trim and lowercase before uniqueness checks and insert.
3. Reject the registration if the username matches any existing email, or the email matches any existing username, so login-by-identifier cannot be ambiguous.
4. Hash the incoming `password` value again with the shared SHA-256 helper (defense in depth: even if a client skipped hashing, plaintext is not what is stored).
5. Call User Service `createUser`. Duplicate username or duplicate email is a conflict, not a 500.
6. Return the created user without `password_hash`.

**Response:**

- Success (201):

```json
{
  "user": {
    "id": "a1b2c3d4e5f6a1b2",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "ada",
    "email": "ada@school.edu"
  }
}
```

- Error (400): validation failure (`{ "error": "..." }`)
- Error (409): username or email already taken (`{ "error": "Username is already taken" }` or `{ "error": "Email is already taken" }`)
- Error (500): unexpected server error (`{ "error": "Unable to register" }`)



#### POST /api/auth/login

Available after a successful registration. Looks up the user by a **single identifier** that may be either the username or the email, then compares hashed passwords. Login has only two fields.

**Request Body:**

```json
{
  "identifier": "ada",
  "password": "<sha256-hex of the plaintext password>"
}
```

`identifier` may also be the account email, for example `"ada@school.edu"`.

**Behavior:**

1. Validate `identifier` and `password` are present. Do not require a separate email field.
2. Trim `identifier`. Also prepare a lowercased copy for email lookup.
3. Hash the incoming `password` with the same server-side SHA-256 used at registration.
4. Call User Service `getUserByLoginIdentifier(identifier)`. Match if `username` equals the trimmed identifier **or** `email` equals the trimmed, lowercased identifier. If no user is found, return 401 with a generic message (do not reveal whether the username or email exists).
5. Compare the computed hash to `password_hash` using a constant-time comparison.
6. On match, return the public profile. On mismatch, return 401 with the same generic message.

**Response:**

- Success (200):

```json
{
  "user": {
    "id": "a1b2c3d4e5f6a1b2",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "ada",
    "email": "ada@school.edu"
  }
}
```

- Error (400): validation failure
- Error (401): `{ "error": "Invalid username/email or password" }`
- Error (500): `{ "error": "Unable to log in" }`



#### POST /api/auth/logout

No server-side session exists in this phase. The endpoint acknowledges logout so the client has a single place to call before navigating away.

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`
- Error (500): `{ "error": "Unable to log out" }`



### User Service

Domain logic lives in `src/lib/services/user-service.ts`. Route handlers must not run SQL. Access D1 through `getDb()` in `src/lib/db.ts:3` (`getCloudflareContext()` then `env.DB`; throw if `DB` is missing at `src/lib/db.ts:5`). Use prepared statements with numbered placeholders (`?1`, `?2`). Prefer `all()` and the first element of `results` over `first()` (`firstUser` at `src/lib/services/user-service.ts:98`).


| Method                                                               | Responsibility                                                                                          | Code |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| `createUser({ firstName, lastName, username, email, passwordHash })` | Insert a user. Throw `UserConflictError` on UNIQUE constraint (username or email)                         | `src/lib/services/user-service.ts:121` |
| `getUserById(id)`                                                    | Return the user row or `null`                                                                           | `src/lib/services/user-service.ts:153` |
| `getUserByUsername(username)`                                        | Return the user row or `null` (username trimmed, case-sensitive)                                         | `src/lib/services/user-service.ts:157` |
| `getUserByEmail(email)`                                              | Return the user row or `null` (email trimmed and lowercased)                                              | `src/lib/services/user-service.ts:164` |
| `getUserByLoginIdentifier(identifier)`                               | Match `username = trimmed` **or** `email = trimmed+lowercased`                                          | `src/lib/services/user-service.ts:171` |
| `updateUser(id, fields)`                                             | Update allowed fields; set `updated_at`; same identifier collision rules as create                       | `src/lib/services/user-service.ts:180` |
| `deleteUser(id)`                                                     | Delete by id; return whether a row was removed                                                          | `src/lib/services/user-service.ts:240` |


`UserConflictError` (`src/lib/services/user-service.ts:5`) messages: `"Username is already taken"` / `"Email is already taken"`. Cross-identifier collisions (username equals another user’s email, and the reverse) are rejected in `assertIdentifierAvailable` (`src/lib/services/user-service.ts:105`) before insert/update.

Internal service types may include `passwordHash`. `toPublicUser()` (`src/lib/services/user-service.ts:75`) strips it before any HTTP response. Email is normalized with `normalizeEmail` (`src/lib/services/user-service.ts:58`).

### Password Hashing

Plaintext passwords must never appear in HTTP bodies from the official UI, and must never be written to D1.

- Algorithm: SHA-256 via the Web Crypto API (`crypto.subtle.digest`). No extra hashing package.
- Encoding: lowercase hex string (64 characters).
- Client: hash the plaintext password in the browser **before** `fetch` to register or login.
- Server: hash the received password field again before insert or compare.
- Stored value: `SHA-256(SHA-256(plaintext))`.
- Login comparison: hash the submitted value, then constant-time compare to `users.password_hash`.
- Shared helper: `src/lib/password.ts`, safe to import from both client components and server modules. It must not import D1, `getCloudflareContext`, or any server-only module.
- `sha256Hex` at `src/lib/password.ts:1`. Constant-time compare: `timingSafeEqual` at `src/lib/password.ts:9` (used by login at `src/app/api/auth/login/handler.ts:28`).
- Zod: `registerBodySchema` at `src/lib/auth-schemas.ts:3`; `loginBodySchema` at `src/lib/auth-schemas.ts:15`; `firstZodError` at `src/lib/auth-schemas.ts:20`.

### Testing (Vitest and TDD)

There is no Cursor testing rule yet. This feature uses **Vitest** as the unit-testing framework. Follow `.cursor/skills/testing/SKILL.md` for harness details. Vitest was installed in Phase 1 (`vitest`, `@vitejs/plugin-react` v5, `@testing-library/react`, `jsdom`, `vite-tsconfig-paths`). Phase 4 added `@testing-library/user-event` (^14.6.7). Prefer `userEvent` over `fireEvent`.

#### TDD approach (required for Phases 1–4)

This feature is built with **Test-Driven Development (TDD)**. Tests define the contract. Product code is written only after those tests exist and have been seen to fail. Do not implement first and retrofit tests. A green suite that was tuned to already-written code does not count as TDD.

**Cycle for every implementation phase:**

1. **Red.** Write the phase's colocated tests from this PRD (happy path and failure path). Run `npm test`. They **must fail** for a real reason: missing module, missing table/SQL, unmet assertion, or wrong status/JSON. If the new tests pass on the first run, they are not proving new behavior — tighten them until they can fail.
2. **Implement.** Write only enough product code to address those failures. Do not add JWT, cookies, OAuth, MCQ CRUD, or extra fields “while you are here.”
3. **Green.** Re-run `npm test`. The phase's tests must pass. Existing tests from earlier phases must stay green (no regressions).
4. **Done when** the suite is green **and** that phase's acceptance criteria hold. Hollow assertions (`expect(true).toBe(true)`) do not count. Inspection without `npm test` does not count.

**What “red” looks like on this feature:**

| Phase | Tests written first | Typical first failure |
| --- | --- | --- |
| 1 | `migrations/users.schema.test.ts` | No migration file, or SQL missing `users` / unique indexes / `password_hash` |
| 2 | `src/lib/password.test.ts`, `src/lib/services/user-service.test.ts` | Missing modules or CRUD/hash behavior unimplemented |
| 3 | `src/app/api/auth/*/route.test.ts` (import `./handler`) | Missing handlers or wrong status/body (201/200/400/409/401) |
| 4 | `src/components/*.test.tsx` | Missing `LoginForm` / `SignupForm` / `McqStub`, or fetch/navigation not hashed/wired |
| 5 | No new red suite unless a gap is found | Run the accumulated suite as the completion gate; if a criterion has no test, write that test first (red), then fix (green) |

**Commands:** `npm test` (`vitest run`) for the gate; `npm test:watch` while iterating. After green, also run `npm run lint` and `npm run build` before calling a phase done.

**Setup** (done in Phase 1; do not reinstall unless missing):

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom vite-tsconfig-paths
```

`vitest.config.ts` at the repo root uses `@vitejs/plugin-react`, `vite-tsconfig-paths` (required for `@/`), `environment: "jsdom"`, and `globals: true`. Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`.

#### Conventions

- Colocate tests: `src/lib/password.ts` → `src/lib/password.test.ts`; UI the same (`login-form.tsx` → `login-form.test.tsx`).
- Assert observable output and side effects (HTTP status, public JSON without `passwordHash`, hashed vs plaintext, accessible names). Cover failure paths (validation, missing rows, duplicates, 401), not only the happy path.
- Name tests so a failure message explains what broke.
- Each test must pass alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
- Mock at the module boundary. Never hit a real D1 database, network, or model provider in a unit test. UI tests mock `fetch` and `next/navigation` (`useRouter().push`); they do not boot Next.js or D1.
- `getCloudflareContext()` does not work under jsdom. Mock `@opennextjs/cloudflare` and supply a fake `env.DB`. Keep D1 behind `src/lib/` so tests mock one module rather than the full prepared-statement chain.
- Mock `server-only` with `vi.mock("server-only", () => ({}))` if a subject imports it.
- Query React UI by role and accessible name. Server Components cannot be rendered by Testing Library; test their logic as functions and reserve `render` for Client Components.
- App Router `route.ts` cannot be imported from Vitest (Next.js TypeScript plugin). Put the handler in `handler.ts`, re-export `{ POST }` from `route.ts`, and have `route.test.ts` import `./handler`.



### User Interface Requirements

Visual starting point is the official **shadcn login and sign-up blocks** (centered `Card` + `Field` layout). Those fragments are not copied blindly: field set, copy, and submit behavior follow this PRD. Styling is **Tailwind CSS v4** via existing utility classes and theme tokens in `src/app/globals.css` (`bg-card`, `text-muted-foreground`, `text-destructive`, and similar). Do not add hard-coded hex colors.

Use existing shadcn/ui pieces only: `button`, `card` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`), `field` (`Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldError`), `input`, `label`. Do not add new UI packages.

**Page vs form split:** App Router pages are Server Components. Forms that hash in the browser are Client Components (`'use client'` on the form, not the whole page when possible). Pages wrap the form in the shadcn block shell:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    {/* LoginForm, SignupForm, or McqStub card */}
  </div>
</div>
```

**Stock block extras that are out of scope (do not ship):** “Sign up / Login with Google”, “Forgot your password?”, a combined “Full Name” field, and confirm-password. Social login and password reset are listed under Out of Scope.

**Shared form behavior:** `noValidate` on the `<form>` so native tooltips do not replace `FieldError`. `required` (and `minLength={8}` on register password) remain on inputs for accessibility. Submit is disabled while the request is in flight. One form-level `FieldError` (`role="alert"`) shows client validation, 400, 401, and 409. Client hashes the plaintext password with `sha256Hex` **before** `fetch`; the JSON body never contains plaintext.

#### Home (/)

- `src/app/page.tsx` redirects to `/login` (`redirect` from `next/navigation`).
- The Create Next App starter splash is not the product home.
- Document title is “Quiz Maker” (`src/app/layout.tsx`).

#### Login (/login)

- Files: `src/app/login/page.tsx` (layout) + `src/components/login-form.tsx` (`LoginForm`).
- Default entry for returning teachers. Root (`/`) redirects here.
- Card title: “Login to your account”. Description: enter username or email to login.
- Exactly two fields, in this order:
  1. **Username or email** (`id`/`name` `identifier`, `type="text"`, required) — one input; the teacher may type either the username or the email from registration. Do not use `type="email"` (usernames are not always emails).
  2. **Password** (`id`/`name` `password`, `type="password"`, required)
- Do not show a separate email field, a Google button, or a forgot-password link.
- Submit button label: **Login**.
- On submit: hash password (`src/components/login-form.tsx:49`), `POST /api/auth/login` with `{ identifier, password }`, on 200 `router.push("/mcq")`.
- Show `FieldError` for missing fields (“Username or email and password are required”) and for the generic 401 message (`Invalid username/email or password`).
- Footer: “Don't have an account?” with `Link` to `/register` (“Sign up”).

#### Register (/register)

- Files: `src/app/register/page.tsx` (layout) + `src/components/signup-form.tsx` (`SignupForm`).
- Card title: “Create an account”. Description: enter information below to create the account.
- Fields, in this order (all required):
  1. **First name** (`firstName`, `type="text"`)
  2. **Last name** (`lastName`, `type="text"`)
  3. **Username** (`username`, `type="text"`) — may be a plain username or an email address
  4. **Email** (`email`, `type="email"`) — unique, valid email format
  5. **Password** (`password`, `type="password"`, min 8 characters **before** hashing)
- Username and email are stored as separate columns even when the username looks like an email.
- Username helper (`FieldDescription`): “Required and unique. May also be an email address. Can be used later to log in.”
- Email helper: “This address is required, must be unique, and can be used later to log in.”
- Password helper: “Must be at least 8 characters long.” Client `FieldError` if shorter than 8: “Password must be at least 8 characters long”.
- Submit button label: **Create Account**.
- On submit: hash password (`src/components/signup-form.tsx:52`), `POST /api/auth/register` with `{ firstName, lastName, username, email, password }`, on 201 `router.push("/login")`. The teacher must then log in; registration does not open `/mcq`.
- Surface 400 and 409 on the form (including “Username is already taken” and “Email is already taken”); do not navigate on failure.
- Footer: “Already have an account?” with `Link` to `/login` (“Sign in”).

#### MCQ Management stub (/mcq)

- Files: `src/app/mcq/page.tsx` + `src/components/mcq-stub.tsx` (`McqStub`).
- Same centered `min-h-svh` / `max-w-sm` shell as login and register.
- Card title: “MCQ Management”.
- Copy: “This is the future shared test-bank workspace. Question CRUD is not available yet.”
- No MCQ create/edit/delete controls.
- Greeting from a public user payload is optional and unused in this phase (no in-memory session).
- Logout control: outline **Log out** button (`src/components/mcq-stub.tsx:42`); handler `onLogout` at `src/components/mcq-stub.tsx:18`.

#### Logout

- Triggered from `/mcq` only (`McqStub`).
- No cookie clearing and no token invalidation in this phase.
- `POST /api/auth/logout`, then `router.push("/login")`.
- If the logout request fails (network or non-OK), still send the teacher to `/login`.

---



## Implementation Phases

Every implementation phase below follows the **TDD** cycle in Testing: write tests first (expect **red**), implement, then **green**. The phase is done when those tests are green **and** the listed acceptance criteria hold.

### Phase 1: Database Foundation - COMPLETED

**Objective**: Vitest is runnable, D1 is bound, and a `users` table migration exists locally.

**Tests first (expect RED):**

1. Install Vitest and config as specified in Testing (harness only; this does not implement the schema).
2. Add `migrations/users.schema.test.ts` (or a colocated equivalent) that reads the User migration SQL and asserts:
   - a `users` table is created
   - columns exist: `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `created_at`, `updated_at`
   - unique indexes exist on `username` and `email`
   - there is no plaintext `password` column
3. Run `npm test`. Expect **red** (no migration file, or SQL missing those constraints).

**Implementation:**

1. Create the D1 database with Wrangler and add the `d1_databases` binding named `DB` to `wrangler.jsonc`
2. Run `npm run cf-typegen` so `env.DB` is typed
3. Create a migration for the `users` table and unique indexes on username and email
4. Apply the migration locally only

**Done when:**

- `npm test` is **green** for the schema tests — **met** (4 passed, 2026-09-01)
- Local D1 has the `users` table (confirm with local Wrangler apply output). That local apply is not a Vitest assertion. Early on this machine, `npx wrangler d1 migrations apply quiz-maker --local` failed with `write EOF` (`workerd` / missing VC++ runtime). SQL was validated in-memory and by reading the migration file. Re-run local apply if `.wrangler` D1 is empty before relying on `npm run preview`.

**What shipped (commit `d39dfe5`):**

- `vitest.config.ts:5` — `jsdom`, `globals`, `@vitejs/plugin-react` v5, `vite-tsconfig-paths`
- `package.json` scripts `"test"` / `"test:watch"`
- `wrangler.jsonc:21` — `d1_databases` binding `DB` → `quiz-maker` / `eea14e86-b327-4629-a4cc-ab6225e01d39`
- `migrations/0001_create_users_table.sql:3` — `users` table; unique indexes at lines 14–15
- `migrations/users.schema.test.ts:31` — four SQL assertions (table, columns, no plaintext `password`, unique indexes)
- `cloudflare-env.d.ts:8` — `DB: D1Database` (generated; do not hand-edit)

### Phase 2: User Service and Hashing - COMPLETED

**Objective**: User records can be created, read, updated, and deleted; passwords are hashed and never stored in plaintext.

**Tests first (expect RED):**

1. Add `src/lib/password.test.ts`:
   - same input produces the same hex digest
   - digest is 64 lowercase hex characters
   - digest is not equal to the plaintext
   - different inputs produce different digests
2. Add `src/lib/services/user-service.test.ts` with a mocked D1 / mocked Cloudflare context:
   - `createUser` persists first name, last name, username, email, and `passwordHash` (never plaintext)
   - `toPublicUser` omits `passwordHash`
   - `getUserById`, `getUserByUsername`, `getUserByEmail` return the row or `null`
   - `getUserByLoginIdentifier` matches username **or** email
   - `updateUser` and `deleteUser` succeed for an existing id
   - duplicate username and duplicate email throw a typed conflict (not an untyped 500)
   - username colliding with another user's email (and email colliding with another user's username) is rejected
3. Run `npm test`. Expect **red** (modules missing or behavior unimplemented).

**Implementation:**

1. Add isomorphic SHA-256 helper in `src/lib/password.ts`
2. Implement User Service CRUD against D1 with prepared statements
3. Map DB rows to public user objects that omit `password_hash`
4. Handle unique username and unique email conflicts as typed errors
5. Implement `getUserByLoginIdentifier` so login can resolve username **or** email

**Done when:**

- `npm test` is **green** for password and User Service tests — **met** (15 passed including Phase 1 schema tests, 2026-09-01)
- No unit test talks to a real D1 database — **met** (`user-service.test.ts` mocks `@/lib/db` at `src/lib/services/user-service.test.ts:27`)

**What shipped (commit `54b70b3`):**

- `src/lib/password.ts:1` (`sha256Hex`) and `src/lib/password.ts:9` (`timingSafeEqual`)
- `src/lib/password.test.ts` — four hashing tests
- `src/lib/db.ts:3` — `getDb()`
- `src/lib/services/user-service.ts` — CRUD + `UserConflictError` + `toPublicUser` + `getUserByLoginIdentifier`
- `src/lib/services/user-service.test.ts:143` — seven tests against an in-memory fake D1 (persist hash not plaintext, omit hash in public user, getters, login identifier, update/delete, 409-style conflicts, username/email cross-collision)

### Phase 3: Authentication APIs - COMPLETED

**Objective**: Register, login, and logout HTTP endpoints consume the User Service.

**Tests first (expect RED):**

1. Propose adding Zod and add it if approved.
2. Add route tests that call the handlers with `Request` objects and mock the User Service (do not hit D1):
   - `src/app/api/auth/register/route.test.ts`
     - 201 with public profile (username + email, no password hash)
     - 400 when required fields are missing or email is not a valid email
     - 409 when username is taken
     - 409 when email is taken
     - incoming password is hashed before `createUser` is called
   - `src/app/api/auth/login/route.test.ts`
     - 200 when identifier is the username and the hash matches
     - 200 when identifier is the email and the hash matches
     - 400 when identifier or password is missing
     - 401 with `{ "error": "Invalid username/email or password" }` for unknown identifier or wrong password (same message both ways)
     - response never includes `passwordHash`
   - `src/app/api/auth/logout/route.test.ts`
     - 200 `{ "ok": true }`
3. Run `npm test`. Expect **red**.

**Implementation:**

1. Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
2. Validate input, hash on the server, and return the status codes in this PRD
3. Ensure login errors are generic and password hashes never appear in responses

**Done when:**

- `npm test` is **green** for the three route suites — **met** (26 passed including Phase 1–2, 2026-09-02)
- Failure-path tests exist (not only 201/200) — **met** (400, 409, 401)

**What shipped (commit `08a8570`):**

- `zod` (^4.5.4) — `src/lib/auth-schemas.ts`
- `src/app/api/auth/register/handler.ts:6` — 201 via `createUser` + `toPublicUser`; 400 invalid JSON/Zod; 409 `UserConflictError`; hashes again at `handler.ts:20`
- `src/app/api/auth/login/handler.ts:8` — 200 public user; 401 generic `INVALID_CREDENTIALS` (`handler.ts:6`) for missing user or hash mismatch; `timingSafeEqual` at `handler.ts:28`
- `src/app/api/auth/logout/handler.ts:3` — `{ ok: true }`
- Thin `route.ts` re-exports in each folder
- Colocated `route.test.ts` files mock the User Service, not D1
- `esbuild` (^0.27.7) as a project `devDependency` so OpenNext/Windows builds can resolve esbuild when a leftover `next dev` is not locking `.open-next`

### Phase 4: Auth UI and MCQ Stub - COMPLETED (verified)

**Objective**: Teachers can register, log in, reach the MCQ stub, and log out.

**Tests first (expect RED):**

1. Propose `@testing-library/user-event` if it is not already installed.
2. Add Client Component tests (`*.test.tsx`) that query by role and accessible name:
   - Login form: exactly two fields (username or email, then password); no separate email field; submit hashes the password before `fetch`; navigates to `/mcq` on 200; shows the generic 401 message on failure
   - Register form: username and email are both required; submit hashes the password before `fetch`; navigates to `/login` on 201 (not `/mcq`); surfaces 409 duplicate username and duplicate email
   - MCQ stub: shows placeholder copy (no MCQ CRUD); logout control calls `POST /api/auth/logout` and navigates to `/login`
3. Mock `fetch` and navigation. Do not boot Next.js or D1.
4. Run `npm test`. Expect **red**.

**Implementation:**

1. Replace the starter home with a redirect to `/login`
2. Start from the shadcn login and sign-up **blocks** (centered `Card` + `Field` layout, Tailwind utilities). Adapt fields and actions to this PRD: drop Google, forgot-password, confirm-password, and combined full name; split first/last name; login identifier is “Username or email”
3. Build `/mcq` placeholder with logout
4. Wire success and error states to the APIs (`FieldError`, hash then `fetch`)

**Done when:**

- `npm test` is **green** for the UI suites — **met** (36 passed including Phases 1–3, 2026-09-02)
- Login still has only two fields; register still requires username and email — **met** (`login-form.test.tsx`, `signup-form.test.tsx`)
- Manual register, login, and logout — **met** (verified in the running app by the product owner on 2026-09-02)

**What shipped (working tree after Phase 3; not in `08a8570` until committed):**

- `@testing-library/user-event` (^14.6.7)
- `src/app/page.tsx:4` — `redirect("/login")`
- `src/app/layout.tsx:15` — title “Quiz Maker”
- `src/app/login/page.tsx:3` + `src/components/login-form.tsx:25` — two fields (`identifier`, `password`); hash at `login-form.tsx:49` then `POST /api/auth/login`; `router.push("/mcq")` on 200; `FieldError` for 401
- `src/app/register/page.tsx:3` + `src/components/signup-form.tsx:24` — first/last/username/email/password; hash at `signup-form.tsx:52` then `POST /api/auth/register`; `router.push("/login")` on 201
- `src/app/mcq/page.tsx:4` + `src/components/mcq-stub.tsx:14` — test-bank placeholder; **Log out** at `mcq-stub.tsx:18` (`POST /api/auth/logout`, then `/login` even on failure)
- Tests: `login-form.test.tsx`, `signup-form.test.tsx`, `mcq-stub.test.tsx`

**Manual verification (2026-09-02):** Register, login, and logout were exercised in the UI and succeeded. Phase 5 re-ran the automated suite and inspected D1 hashes (see Phase 5).

### Phase 5: Verification - COMPLETED

**Objective**: The feature is proven by a green Vitest suite, lint, build, and a real user flow — not inspection alone.

**Tests first:**

This phase does not add a new red suite. It runs the accumulated tests as the completion gate.

1. Run `npm test` and confirm **all** phase tests are green. If any are red, return to that phase; do not skip ahead.
2. If a gap in the suites is found (an acceptance criterion with no test), write that test first (red), then fix the product code (green) before continuing.

**Implementation / verification:**

1. Run `npm run lint` and `npm run build` and record the actual result
2. Exercise register → `/login` → login (by username) → `/mcq` and login (by email)
3. Confirm duplicate username and duplicate email are rejected; wrong credentials do not leak which identifier exists
4. Confirm D1 stores only hashes

**Done when:**

- `npm test` is green — **met** (36 passed, 9 files, 2026-09-02 10:30)
- `npm run lint` and `npm run build` succeed — **met** (lint: 0 errors, 1 unused `_request` warning in `src/app/api/auth/logout/handler.ts:3`; build succeeded with routes `/`, `/login`, `/register`, `/mcq`, and the three auth APIs)
- Manual happy path and duplicate/invalid-credential paths match the acceptance criteria — **met** (no product-code changes)

**What was verified (2026-09-02) against** `https://quiz-maker-2026.quiz-maker-jaya.workers.dev`:

| Check | Result |
| --- | --- |
| `POST /api/auth/register` new user `p5103137` | **201** public profile (no `passwordHash`) |
| Login by username `p5103137` | **200** |
| Login by email `p5103137@school.edu` | **200** |
| `POST /api/auth/logout` | **200** `{ "ok": true }` |
| Duplicate username | **409** `{ "error": "Username is already taken" }` |
| Duplicate email | **409** `{ "error": "Email is already taken" }` |
| Wrong password | **401** `{ "error": "Invalid username/email or password" }` |
| Unknown identifier | **401** same generic message (does not leak which field failed) |

**D1 hashes (no plaintext):**

- Remote `users`: 3 rows; all `length(password_hash) = 64`; none equal `first_name` / `last_name` / `username` / `email`
- Local `users`: 1 row (`test` / `test@test.com`); `hash_len` 64, lowercase hex

Studio URL is the **remote** database. `npm run dev` writes **local** D1. No product files were changed in this phase.

**Deliverables:**

- Lint, build, and test results reported (this section)
- Manual flow verified against D1 where the runtime allows it

---



## Technical Implementation Details



### Key Files

- `wrangler.jsonc:7` — Worker name `quiz-maker-2026`; `d1_databases` at `wrangler.jsonc:21` (`DB` → `quiz-maker` / `eea14e86-b327-4629-a4cc-ab6225e01d39`)
- `cloudflare-env.d.ts:8` — `DB: D1Database` (generated)
- `vitest.config.ts:5` — Vitest (`jsdom`, `globals`, `@/` via `vite-tsconfig-paths`)
- `migrations/0001_create_users_table.sql:3` — `users` table; unique indexes at lines 14–15
- `migrations/users.schema.test.ts:31` — schema tests (read SQL files; no live D1)
- `src/lib/password.ts:1` — `sha256Hex`; `src/lib/password.ts:9` — `timingSafeEqual`
- `src/lib/password.test.ts` — hashing unit tests
- `src/lib/db.ts:3` — `getDb()`; missing-binding throw at `src/lib/db.ts:5`
- `src/lib/services/user-service.ts` — only module that talks to D1 for users (`UserConflictError` at `:5`; `toPublicUser` at `:75`; `createUser` at `:121`; `getUserByLoginIdentifier` at `:171`)
- `src/lib/services/user-service.test.ts:27` — mocks `@/lib/db`; suite at `:143`
- `src/lib/auth-schemas.ts:3` — `registerBodySchema`; `loginBodySchema` at `:15`
- `src/app/api/auth/register/handler.ts:6` — register `POST`; `src/app/api/auth/register/route.ts:1` re-export; `route.test.ts` imports `./handler`
- `src/app/api/auth/login/handler.ts:8` — login `POST`; generic 401 at `:6` / `:24` / `:29`
- `src/app/api/auth/logout/handler.ts:3` — logout `POST`
- `src/app/login/page.tsx:3` — login page shell; `src/components/login-form.tsx:25` — `LoginForm`; hash+fetch at `:49`
- `src/app/register/page.tsx:3` — register page shell; `src/components/signup-form.tsx:24` — `SignupForm`; hash+fetch at `:52`
- `src/app/mcq/page.tsx:4` — MCQ stub route; `src/components/mcq-stub.tsx:14` — `McqStub`; logout at `:18`
- `src/components/login-form.test.tsx`, `signup-form.test.tsx`, `mcq-stub.test.tsx` — UI tests (mock `fetch` and `useRouter`)
- `src/app/page.tsx:4` — `redirect("/login")`
- `src/app/layout.tsx:15` — metadata title “Quiz Maker”
- `src/components/ui/field.tsx:176` — `FieldError` (`role="alert"` at `:217`)



### Implementation record (as of 2026-09-02)

Branch: `feature/user-authentication` (tracks `origin/feature/user-authentication`). All auth work stays on this branch until asked to merge.

| Commit | Phase | Summary |
| --- | --- | --- |
| `d39dfe5` | 1 | User table migration + Vitest harness |
| `54b70b3` | 2 | SHA-256 + User Service |
| `08a8570` | 3 | Register/login/logout APIs + Zod |
| `6a69b61` | 4 | shadcn login/register/MCQ UI, `user-event`, PRD UI/TDD record |
| *(this commit)* | 5 | Verification results: suite, lint, build, D1 hashes, username+email login |

**TDD:** Each of Phases 1–4 wrote colocated tests first (red), then product code until green. See Testing.

**Automated suite after Phase 5:** `npm test` → **36 passed** (9 files). `npm run lint` → 0 errors; 1 unused `_request` warning in `src/app/api/auth/logout/handler.ts:3`. `npm run build` → succeeded; routes `/`, `/login`, `/register`, `/mcq`, and the three auth APIs.

**Manual verification (Phase 4 review + Phase 5, 2026-09-02):** Product owner confirmed register, login, and logout in the UI. Phase 5 additionally confirmed login by username and by email, 409 duplicates, generic 401, and 64-character hex hashes in D1.

**Dependencies added for this feature (proposed at phase start, then installed):**

- Phase 1: `vitest` ^4.1.11, `@vitejs/plugin-react` ^5.2.0, `@testing-library/react`, `jsdom`, `vite-tsconfig-paths`
- Phase 3: `zod` ^4.5.4; `esbuild` ^0.27.7 (OpenNext on Windows)
- Phase 4: `@testing-library/user-event` ^14.6.7

**Not added:** JWT, cookies, OAuth, bcrypt, `@cloudflare/vitest-pool-workers`, AI SDK.

**Windows / Wrangler notes encountered while implementing:**

- PowerShell execution policy Restricted: use `npx.cmd` / `npm.cmd` (or Bypass for the process).
- Local `workerd` needed the MSVC 2015–2022 x64 redistributable (`vcruntime140.dll`) after `write EOF` / `UV_HANDLE_CLOSING`.
- Do not run `next dev` and `npm run deploy` at the same time; leftover Node/workerd can EPERM-lock `.open-next`.
- `npm run dev` is Node and will not exercise Workers D1 the same way as `npm run preview`.
- Never `npm run deploy` or `wrangler d1 ... --remote` unless explicitly asked.

**Client hashing used in UI:**

```typescript
const hashedPassword = await sha256Hex(password);
await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier, password: hashedPassword }),
});
```

Register uses the same hash-then-`fetch` pattern against `/api/auth/register` (`src/components/signup-form.tsx:52`). Stored value remains `SHA-256(SHA-256(plaintext))` because the server hashes again (`src/app/api/auth/register/handler.ts:20`, `src/app/api/auth/login/handler.ts:27`).



### Implementation Patterns

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB;
}
```

```typescript
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

```typescript
export { POST } from "./handler";
```

```sql
-- numbered placeholders only
INSERT INTO users (first_name, last_name, username, email, password_hash)
VALUES (?1, ?2, ?3, ?4, ?5);
```



### Important Notes

- D1 is server-only. Never import the User Service or `getCloudflareContext` into a `'use client'` file.
- `npm run dev` runs on Node and will not exercise Workers/D1 the same way as production. Verify database-backed auth with `npm run preview` when possible.
- Creating a D1 database requires Wrangler authentication. Cloud agents without Cloudflare credentials cannot finish Phase 1 remotely; that step must run locally.
- Ask before adding dependencies. Zod, Vitest (+ testing-library/jsdom/vite-tsconfig-paths), `@testing-library/user-event`, and `esbuild` were proposed at the relevant phase and installed then. Hashing uses Web Crypto; do not add bcrypt or an auth framework.
- Do not deploy. Do not apply D1 migrations with `--remote`.
- Do not hand-edit `cloudflare-env.d.ts`, `next-env.d.ts`, or `package-lock.json`.
- Logout does not establish or destroy a session. The MCQ page is not a protected resource in this phase.
- Username uniqueness is case-sensitive. Usernames are stored **trimmed** and compared as stored (SQLite UNIQUE on TEXT is case-sensitive). Email is always stored trimmed and lowercased so `Ada@School.edu` and `ada@school.edu` collide as duplicates. Login email lookup must apply the same normalization.
- Login has no email field of its own. `getUserByLoginIdentifier` resolves one string against `username` or `email`.
- Because username may itself be an email, registration must refuse a username that equals another user's email and an email that equals another user's username. Otherwise one identifier could match two accounts.
- `@vitejs/plugin-react` is pinned to **v5** (`^5.2.0`). v6 pulled a Babel 8 peer that conflicts with this repo.
- Wrangler `name` must be lowercase with dashes (`quiz-maker-2026`). `Quiz-Maker-2026` is rejected by Wrangler 4.
- `npm run cf-typegen` with runtime types crashed (`write EOF`) on this Windows host. `env.DB` was added to `cloudflare-env.d.ts` from `wrangler types --include-runtime false`. Re-run full `npm run cf-typegen` when workerd starts successfully; prefer that over further hand-edits.
- `npx wrangler d1 migrations apply quiz-maker --local` is not yet successful here. Do not apply with `--remote`.

---



## Acceptance Criteria

- [x] A D1 `users` table exists locally with id, first name, last name, username, email, and password hash
- [x] Registration requires both username and email; username may be an email address; email must be a valid email format
- [x] Username is unique; a second registration with the same username is rejected with 409
- [x] Email is unique; a second registration with the same email is rejected with 409
- [x] Passwords are never stored in plaintext; D1 contains only hashes
- [x] The register and login UIs hash the password before the HTTP request is sent
- [x] Registration uses the User Service to insert a user and returns 201 with a public profile (no `passwordHash`) that includes username and email
- [x] The login page has exactly two fields: username or email, then password
- [x] Login with the registered username and correct password returns 200 and redirects to `/mcq`
- [x] Login with the registered email and correct password returns 200 and redirects to `/mcq`
- [x] Login with a wrong password or unknown identifier returns 401 with `{ "error": "Invalid username/email or password" }`
- [x] User Service supports create, update, retrieve (by id, by username, by email, and by login identifier), and delete
- [x] Successful registration redirects to `/login` so the teacher must authenticate before `/mcq` — unit tests 2026-09-03
- [x] Successful login redirects to `/mcq` — unit tests and **manual verification 2026-09-02**
- [x] `/mcq` is a stub (no MCQ CRUD) and offers logout
- [x] Logout calls `POST /api/auth/logout` and returns the teacher to `/login` — unit tests and **manual verification 2026-09-02**
- [x] No JWT, cookies, social login, or session store is introduced
- [x] Vitest is installed and `npm test` runs the colocated `*.test.ts` / `*.test.tsx` files
- [x] Phase 1 schema tests were written first (red: no SQL files), then turned green against `migrations/0001_create_users_table.sql`
- [x] Each implementation phase wrote tests first (red), then turned them green; the suite covers happy paths and failure paths — Phases 1–5 met
- [x] `npm test`, `npm run lint`, and `npm run build` succeed; results are reported, not assumed — Phase 5 (2026-09-02): 36 passed / lint 0 errors 1 warning / build ok

---



## Success Metrics


| Metric                     | Target                                                           | How Measured                                                         |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Distinct teacher accounts  | 2+ users can register with different usernames and emails        | Insert two users via the register UI and confirm two rows in `users` |
| Plaintext password leakage | 0 plaintext passwords in D1 or API responses                     | Inspect `password_hash` column and JSON responses                    |
| Auth completion            | Register then login, or existing-user login, reaches `/mcq`      | Manual flow on local preview                                         |
| Duplicate identity         | 100% of duplicate usernames and duplicate emails rejected        | Repeat register with the same username or the same email, expect 409 |
| Time to first identity     | A new teacher can register, log in, and land on `/mcq` in under 2 minutes | Stopwatch on the happy path                                          |
| Unit tests                 | `npm test` exits 0 with no skipped hollow assertions             | Vitest run in Phase 5                                                |


---



## Dependencies



### External Dependencies

- Cloudflare D1 — User table storage; bound as `DB` to `quiz-maker` (`eea14e86-b327-4629-a4cc-ab6225e01d39`)
- Web Crypto API — SHA-256 in the browser and on Workers (built in; no package)



### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — access `env.DB` via `src/lib/db.ts`
- Existing shadcn/ui (`button`, `card`, `field`, `input`, `label`) plus the official login/sign-up **blocks** as the visual starting point — register/login/MCQ UI (Tailwind CSS v4 utilities; theme tokens only)
- `zod` (^4.5.4) — validate register and login JSON bodies in route handlers
- `vitest` ^4.1.11, `@vitejs/plugin-react` ^5.2.0, `@testing-library/react`, `jsdom`, `vite-tsconfig-paths` — unit test harness (Phase 1)
- `@testing-library/user-event` (^14.6.7) — UI interaction in Phase 4 component tests
- `esbuild` (^0.27.7) — OpenNext build on this Windows host



### Environment

- No new secrets are required for hashing.
- D1 ID in `wrangler.jsonc` is configuration, not a secret.
- Keep `.dev.vars` gitignored. This feature did not add a new env var.

---



## Risks and Mitigation



### Technical Risks

- **Risk**: D1 is unavailable under `npm run dev` (Node), so auth appears broken during local Node development.
- **Mitigation**: Document that database-backed paths are verified with `npm run preview`. Fail with a clear server error if `env.DB` is missing rather than crashing opaquely.
- **Risk**: SHA-256 is fast and unsalted, so stolen hashes are weaker than bcrypt/Argon2.
- **Mitigation**: Accept for this foundation sprint (no session/JWT, simple hashing). Never log hashes. Add a proper password KDF in a later auth hardening sprint.
- **Risk**: Client-hashed passwords can be replayed if HTTP is intercepted, because there is no session nonce.
- **Mitigation**: This is an accepted limitation of hash-before-transmit without TLS-bound sessions. Do not add JWT or cookies to “fix” it in this phase.
- **Risk**: Mixing anonymous `?` and numbered `?1` placeholders causes Wrangler binding errors.
- **Mitigation**: Use numbered placeholders only, per project D1 rules.
- **Risk**: A new D1 database cannot be created without Cloudflare login.
- **Mitigation**: Phase 1 must run on a machine with Wrangler auth. Cloud agents should stop and say so rather than invent a fake binding.
- **Risk**: Tests stay green without proving behavior (hollow assertions, or tests written after the fact and tuned to the implementation).
- **Mitigation**: Write tests first and require them to fail. Assert on HTTP status, public JSON, hashed vs plaintext, and accessible UI — not `expect(true).toBe(true)`.
- **Risk**: Unit tests call real D1 or `getCloudflareContext()` and fail under jsdom.
- **Mitigation**: Mock `@opennextjs/cloudflare` and keep D1 behind `src/lib/`. Do not add `@cloudflare/vitest-pool-workers` in this feature.



### User Experience Risks

- **Risk**: Teachers expect to stay logged in after refresh, but there is no session.
- **Mitigation**: Keep `/mcq` copy honest (placeholder). Logout still returns them to login. Do not fake a session in localStorage as a substitute.
- **Risk**: Duplicate username, duplicate email, or login failure feels like a generic crash.
- **Mitigation**: Map 409 and 401 to visible `FieldError` text. Never show stack traces in the UI.
- **Risk**: Teachers look for a separate email field on login because registration collected one.
- **Mitigation**: Label the first login field “Username or email” and keep the form to those two fields only.

---



## Troubleshooting Guide

Populate with real incidents as they are fixed. Anticipated issues:

### D1 binding missing at runtime

**Problem**: Register/login throws or returns 500; `env.DB` is undefined.
**Cause**: Binding not added to `wrangler.jsonc`, or the app was run with `npm run dev` instead of the Workers preview.
**Solution**: Confirm the `d1_databases` block with binding `DB`, run `npm run cf-typegen`, apply the local migration, and retest with `npm run preview`.
**Code Reference**: `wrangler.jsonc`; `.cursor/rules/d1.mdc`

### UNIQUE constraint on username or email

**Problem**: Second insert with the same username or the same email becomes a 500.
**Cause**: SQLite unique error not translated in the User Service.
**Solution**: Catch the D1 constraint error in `createUser` and return 409 from the register route with a message that distinguishes username vs email when the constraint name is known.

### Password compare always fails

**Problem**: Newly registered user cannot log in with the same password.
**Cause**: Client hashed but server hashed a different number of times, or hex casing differs.
**Solution**: Both register and login must apply the same server-side SHA-256 to the incoming field. Normalize hex to lowercase.

### `first()` returns inconsistent rows

**Problem**: Login cannot find a user that exists.
**Cause**: D1 `first()` differs between local and remote.
**Solution**: Use `all()` and read `results[0]`.

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` is missing from `vitest.config.ts`.
**Solution**: Add the plugin as shown in `.cursor/skills/testing/SKILL.md`.

### Wrangler local D1 / `cf-typegen` write EOF

**Problem**: `npx wrangler d1 migrations apply quiz-maker --local` and full `npm run cf-typegen` crash with `write EOF` and `UV_HANDLE_CLOSING` on Windows.
**Cause**: Local Wrangler uses `workerd`. On this host the workerd binary failed to run (status `3221225781`, typically a missing Visual C++ runtime DLL).
**Solution**: Install the Microsoft Visual C++ Redistributable, confirm `node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe --version` works, then re-run local migrate and `npm run cf-typegen`. Until then, schema tests read the SQL file; do not apply the migration with `--remote`.
**Code Reference**: `wrangler.jsonc`; `migrations/0001_create_users_table.sql`

### `@vitejs/plugin-react` v6 peer conflict

**Problem**: `npm install -D @vitejs/plugin-react` (unpinned) fails with ERESOLVE against Babel 7.
**Cause**: plugin-react v6 wants Babel 8; this repo still has Babel 7 via shadcn.
**Solution**: Pin `@vitejs/plugin-react@5` as in `package.json`.

### Next.js cannot import `route.ts` from Vitest

**Problem**: Importing `src/app/api/auth/*/route.ts` from a test fails under the Next.js TypeScript plugin.
**Cause**: App Router `route.ts` is reserved as a route module.
**Solution**: Implement `POST` in `handler.ts`, re-export from `route.ts`, import `./handler` in `route.test.ts`.
**Code Reference**: `src/app/api/auth/register/handler.ts:6`; `src/app/api/auth/register/route.ts:1`

### OpenNext deploy EPERM / missing esbuild on Windows

**Problem**: `npm run deploy` fails with EPERM on `.open-next` or cannot find `esbuild`.
**Cause**: A leftover `next dev` / `workerd` process locks the build directory; OpenNext expects `esbuild` as a resolvable package.
**Solution**: Stop Next/workerd, delete `.open-next` if needed, keep `esbuild` as a `devDependency`. Do not run `next dev` and deploy at the same time.
**Code Reference**: `package.json` `esbuild` devDependency

### `getCloudflareContext` throws in tests

**Problem**: User Service or route tests crash under jsdom.
**Cause**: The Cloudflare helper is not mocked.
**Solution**: `vi.mock("@opennextjs/cloudflare", ...)` and pass a fake `env.DB`. Never let a unit test reach a real database.

---



## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent: multi-teacher identity, not MCQ features and not full session auth.
2. Use Scope (In/Out/Cut) as a hard boundary. Do not add JWT, cookies, OAuth, or MCQ CRUD.
3. Update phase status markers as work progresses (`PLANNED` → `IN PROGRESS` → `COMPLETED`).
4. Add concrete file paths and line references under Technical Implementation Details as code is written.
5. Mark acceptance criteria when they are verified, not when files merely exist.
6. Add troubleshooting entries when bugs are found and fixed.
7. Keep all sections current; remove instructions that no longer match the code.
8. Cite code as `filepath:line-number`.
9. Propose Zod before adding it; use Web Crypto for hashing; do not add bcrypt or an auth framework.
10. Propose Vitest and the packages listed in `.cursor/skills/testing/SKILL.md` before installing. There is no testing Cursor rule yet; the skill and this PRD are the source of truth.
11. Follow the **TDD** cycle in Testing for Phases 1–4: write the listed tests first, run `npm test` (expect red), then implement until green. Do not implement first and retrofit tests. Phase 5 runs the accumulated suite; if a gap is found, still red then green.
12. Never deploy. Never apply D1 migrations remotely.
13. Verify with `npm test`, `npm run lint`, and `npm run build` before calling the phase done.

---



## Current Status

**Last Updated**: 2026-09-03
**Current Phase**: Phase 5 - Verification
**Status**: COMPLETED
**Next Steps**: Auth foundation is complete. 2026-09-03: successful registration redirects to `/login`; only a successful login opens `/mcq`. Existing users still log in directly.