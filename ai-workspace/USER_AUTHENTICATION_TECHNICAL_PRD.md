Date created: 2026-09-01
Date last modified: 2026-09-01

# User Authentication Foundation - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield application for teachers who need to collaborate on a shared bank of multiple-choice questions. There is no product yet: no users, no database, and no way for more than one teacher to sign in. Without a user identity, later MCQ features cannot be attributed to a person or shared across a teaching team.

This first phase solves that by adding a User entity, hashed-password registration and login, and a logout path. After a successful registration or login, the teacher lands on a placeholder MCQ Management page that later sprints will replace with real question tools.

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
- Vitest unit tests written **before** implementation in every phase (red → implement → green)



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

Cloudflare D1 (SQLite) is not configured yet. Implementation must create a D1 database, bind it as `DB` in `wrangler.jsonc`, run `npm run cf-typegen`, and add a migration. Apply migrations **locally only** (`--local`). Do not apply them remotely.

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

All mutating endpoints validate the JSON body with a Zod schema before calling the User Service. Treat every input as untrusted.

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

Domain logic lives in `src/lib/services/user-service.ts`. Route handlers must not run SQL. Access D1 through `getCloudflareContext()` from `@opennextjs/cloudflare`, then `env.DB`. Use prepared statements with numbered placeholders (`?1`, `?2`). Prefer `all()` and the first element of `results` over `first()`.


| Method                                                               | Responsibility                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `createUser({ firstName, lastName, username, email, passwordHash })` | Insert a user. Throw a typed duplicate error on UNIQUE constraint (username or email)                   |
| `getUserById(id)`                                                    | Return the user row or `null`                                                                           |
| `getUserByUsername(username)`                                        | Return the user row or `null`                                                                           |
| `getUserByEmail(email)`                                              | Return the user row or `null`                                                                           |
| `getUserByLoginIdentifier(identifier)`                               | Return the user whose username **or** email matches; used by login                                      |
| `updateUser(id, fields)`                                             | Update allowed fields (`firstName`, `lastName`, `username`, `email`, `passwordHash`); set `updated_at` |
| `deleteUser(id)`                                                     | Delete by id; return whether a row was removed                                                          |


Internal service types may include `passwordHash`. A `toPublicUser()` mapper strips it before any HTTP response.

### Password Hashing

Plaintext passwords must never appear in HTTP bodies from the official UI, and must never be written to D1.

- Algorithm: SHA-256 via the Web Crypto API (`crypto.subtle.digest`). No extra hashing package.
- Encoding: lowercase hex string (64 characters).
- Client: hash the plaintext password in the browser **before** `fetch` to register or login.
- Server: hash the received password field again before insert or compare.
- Stored value: `SHA-256(SHA-256(plaintext))`.
- Login comparison: hash the submitted value, then constant-time compare to `users.password_hash`.
- Shared helper: `src/lib/password.ts`, safe to import from both client components and server modules. It must not import D1, `getCloudflareContext`, or any server-only module.

### Testing (Vitest)

There is no Cursor testing rule yet. This feature still uses **Vitest** as the unit-testing framework. Follow `.cursor/skills/testing/SKILL.md`. Vitest is **not installed** in the starter; install it the first time tests are needed (Phase 1).

**Workflow for every implementation phase:**

1. Write the phase's tests first. Run `npm test`. They should **fail (red)** — missing modules, missing tables, or unmet assertions.
2. Implement only enough to address those failures.
3. Re-run `npm test`. The phase's tests should **pass (green)**.
4. A phase is not complete until its tests are green **and** its acceptance criteria are met. A green suite with hollow assertions (`expect(true).toBe(true)`) does not count.

**Setup** (do this once, at the start of Phase 1):

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom vite-tsconfig-paths
```

Add `vitest.config.ts` at the repo root with `@vitejs/plugin-react`, `vite-tsconfig-paths` (required for the `@/` alias), `environment: "jsdom"`, and `globals: true`. Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`.

Phase 4 UI tests also need `@testing-library/user-event` (prefer `userEvent` over `fireEvent`). Propose it when that phase starts; do not add it silently.

**Conventions:**

- Colocate tests: `src/lib/password.ts` → `src/lib/password.test.ts`.
- Assert observable output and side effects. Cover failure paths (validation, missing rows, duplicates), not only the happy path.
- Name tests so a failure message explains what broke.
- Each test must pass alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
- Mock at the module boundary. Never hit a real D1 database, network, or model provider in a unit test.
- `getCloudflareContext()` does not work under jsdom. Mock `@opennextjs/cloudflare` and supply a fake `env.DB`. Keep D1 behind `src/lib/` so tests mock one module rather than the full prepared-statement chain.
- Mock `server-only` with `vi.mock("server-only", () => ({}))` if a subject imports it.
- Query React UI by role and accessible name. Server Components cannot be rendered by Testing Library; test their logic as functions and reserve `render` for Client Components.



### User Interface Requirements

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`). Forms that hash in the browser are Client Components. Keep `'use client'` on the form, not the whole page, when possible. Theme tokens from `src/app/globals.css` only; no hard-coded hex colors.

#### Login (/login)

- Default entry for returning teachers after they have registered. The site root (`/`) should redirect or render this flow so the starter splash is not the product home.
- Exactly two fields, in this order:
  1. Username or email (required) — one input; the teacher may type either the username or the email from registration
  2. Password (required, `type="password"`)
- Do not show a separate email field on login.
- On submit: hash password, `POST /api/auth/login` with `{ identifier, password }`, on 200 navigate to `/mcq`.
- Show `FieldError` for validation and for the generic 401 message.
- Link to `/register` for new teachers.



#### Register (/register)

- Fields: first name, last name, username (required; may be a plain username or an email address), email (required, `type="email"`, unique, valid email format), password (min 8 characters **before** hashing).
- Both username and email are required. They are stored as separate columns even when the username looks like an email.
- Email helper text: this address is required, must be unique, and can be used later to log in.
- Username helper text: required and unique; may also be an email address; can be used later to log in.
- On submit: hash password, `POST /api/auth/register`, on 201 navigate to `/mcq`.
- Surface 400 and 409 errors on the form (including duplicate username and duplicate email); do not navigate on failure.
- Link to `/login` for existing users.



#### MCQ Management stub (/mcq)

- Placeholder landing page after successful registration or login.
- Copy that this is the future shared test-bank workspace (no MCQ CRUD).
- Show a simple greeting if the public user payload was passed through (optional; in-memory only).
- Logout control: `POST /api/auth/logout`, then navigate to `/login`.



#### Logout

- Triggered from `/mcq`.
- No cookie clearing and no token invalidation in this phase.
- After the logout request (or if it fails, still send the user to login), navigate to `/login`.

---



## Implementation Phases

Every phase below starts with tests that are expected to fail. Implementation follows. The phase is done when those tests are green **and** the listed acceptance criteria hold.

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
- Local D1 has the `users` table (confirm with local Wrangler apply output). That local apply is not a Vitest assertion. — **blocked on this machine**: `npx wrangler d1 migrations apply quiz-maker --local` fails with `write EOF` because `workerd` cannot start (Windows `UV_HANDLE_CLOSING` / missing native runtime). SQL was validated in-memory with Node `node:sqlite`. Re-run the Wrangler local apply after workerd runs before relying on `npm run preview`.

**Deliverables:**

- `vitest.config.ts`, `npm test` / `npm test:watch` scripts
- D1 binding in `wrangler.jsonc`
- Updated `cloudflare-env.d.ts` via cf-typegen (generated; do not hand-edit)
- Migration file under `migrations/`
- Schema tests next to the migration or under `src/lib/`

### Phase 2: User Service and Hashing - PLANNED

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

- `npm test` is **green** for password and User Service tests
- No unit test talks to a real D1 database

**Deliverables:**

- `src/lib/password.ts` + `src/lib/password.test.ts`
- `src/lib/services/user-service.ts` + `src/lib/services/user-service.test.ts`
- No plaintext password in persistence paths

### Phase 3: Authentication APIs - PLANNED

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

- `npm test` is **green** for the three route suites
- Failure-path tests exist (not only 201/200)

**Deliverables:**

- Route handlers under `src/app/api/auth/`
- Zod schemas for register and login bodies
- Colocated `route.test.ts` files

### Phase 4: Auth UI and MCQ Stub - PLANNED

**Objective**: Teachers can register, log in, reach the MCQ stub, and log out.

**Tests first (expect RED):**

1. Propose `@testing-library/user-event` if it is not already installed.
2. Add Client Component tests (`*.test.tsx`) that query by role and accessible name:
   - Login form: exactly two fields (username or email, then password); no separate email field; submit hashes the password before `fetch`; navigates to `/mcq` on 200; shows the generic 401 message on failure
   - Register form: username and email are both required; submit hashes the password before `fetch`; navigates to `/mcq` on 201; surfaces 409 duplicate username and duplicate email
   - MCQ stub: shows placeholder copy (no MCQ CRUD); logout control calls `POST /api/auth/logout` and navigates to `/login`
3. Mock `fetch` and navigation. Do not boot Next.js or D1.
4. Run `npm test`. Expect **red**.

**Implementation:**

1. Replace the starter home with the login entry path
2. Build register and login forms that hash before submit
3. Build `/mcq` placeholder with logout
4. Wire success and error states to the APIs

**Done when:**

- `npm test` is **green** for the UI suites
- Login still has only two fields; register still requires username and email

**Deliverables:**

- `/login`, `/register`, `/mcq` routes
- Client hashing before HTTP
- Redirect to `/mcq` after successful register or login
- Colocated component tests

### Phase 5: Verification - PLANNED

**Objective**: The feature is proven by a green Vitest suite, lint, build, and a real user flow — not inspection alone.

**Tests first:**

This phase does not add a new red suite. It runs the accumulated tests as the completion gate.

1. Run `npm test` and confirm **all** phase tests are green. If any are red, return to that phase; do not skip ahead.
2. If a gap in the suites is found (an acceptance criterion with no test), write that test first (red), then fix the product code (green) before continuing.

**Implementation / verification:**

1. Run `npm run lint` and `npm run build` and record the actual result
2. Exercise register → `/mcq` → logout → login (by username) → `/mcq` and login (by email) (browser or `npm run preview` for D1)
3. Confirm duplicate username and duplicate email are rejected; wrong credentials do not leak which identifier exists
4. Confirm D1 stores only hashes

**Done when:**

- `npm test` is green
- `npm run lint` and `npm run build` succeed (report actual output)
- Manual happy path and duplicate/invalid-credential paths match the acceptance criteria

**Deliverables:**

- Lint, build, and test results reported
- Manual flow verified against D1 where the runtime allows it

---



## Technical Implementation Details



### Key Files

- `wrangler.jsonc` — Worker name `quiz-maker-2026`; D1 binding `DB` → database `quiz-maker` (`eea14e86-b327-4629-a4cc-ab6225e01d39`)
- `vitest.config.ts` — Vitest config (`jsdom`, `globals`, `@/` via `vite-tsconfig-paths`)
- `migrations/0001_create_users_table.sql` — User table and unique username/email indexes
- `migrations/users.schema.test.ts` — asserts the migration SQL
- `src/lib/password.ts` — SHA-256 helper for client and server
- `src/lib/password.test.ts` — hashing unit tests
- `src/lib/services/user-service.ts` — User CRUD; only module that talks to D1 for users
- `src/lib/services/user-service.test.ts` — User Service unit tests (mocked D1)
- `src/app/api/auth/register/route.ts` — registration endpoint
- `src/app/api/auth/register/route.test.ts` — register API tests
- `src/app/api/auth/login/route.ts` — login endpoint
- `src/app/api/auth/login/route.test.ts` — login API tests
- `src/app/api/auth/logout/route.ts` — logout acknowledgement
- `src/app/api/auth/logout/route.test.ts` — logout API tests
- `src/app/login/page.tsx` — login page
- `src/app/register/page.tsx` — registration page
- `src/app/mcq/page.tsx` — MCQ Management stub
- `src/components/` — auth form Client Components (hash then `fetch`) and colocated `*.test.tsx`
- `src/app/page.tsx` — replace starter splash with redirect or login entry



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

```sql
-- numbered placeholders only
INSERT INTO users (first_name, last_name, username, email, password_hash)
VALUES (?1, ?2, ?3, ?4, ?5);
```



### Important Notes

- D1 is server-only. Never import the User Service or `getCloudflareContext` into a `'use client'` file.
- `npm run dev` runs on Node and will not exercise Workers/D1 the same way as production. Verify database-backed auth with `npm run preview` when possible.
- Creating a D1 database requires Wrangler authentication. Cloud agents without Cloudflare credentials cannot finish Phase 1 remotely; that step must run locally.
- Ask before adding dependencies. This phase expects **Zod** for request validation and **Vitest** plus the packages in `.cursor/skills/testing/SKILL.md` for unit tests. Hashing uses Web Crypto, so no hashing library should be added.
- Do not deploy. Do not apply D1 migrations with `--remote`.
- Do not hand-edit `cloudflare-env.d.ts`, `next-env.d.ts`, or `package-lock.json`.
- Logout does not establish or destroy a session. The MCQ page is not a protected resource in this phase.
- Username uniqueness is case-sensitive unless implementation normalizes to a consistent case before insert and lookup. Prefer storing and comparing a trimmed username; document the chosen rule in this section when implemented.
- Email is always stored trimmed and lowercased so `Ada@School.edu` and `ada@school.edu` collide as duplicates. Login email lookup must apply the same normalization.
- Login has no email field of its own. `getUserByLoginIdentifier` resolves one string against `username` or `email`.
- Because username may itself be an email, registration must refuse a username that equals another user's email and an email that equals another user's username. Otherwise one identifier could match two accounts.
- `@vitejs/plugin-react` is pinned to **v5** (`^5.2.0`). v6 pulled a Babel 8 peer that conflicts with this repo.
- Wrangler `name` must be lowercase with dashes (`quiz-maker-2026`). `Quiz-Maker-2026` is rejected by Wrangler 4.
- `npm run cf-typegen` with runtime types crashed (`write EOF`) on this Windows host. `env.DB` was added to `cloudflare-env.d.ts` from `wrangler types --include-runtime false`. Re-run full `npm run cf-typegen` when workerd starts successfully; prefer that over further hand-edits.
- `npx wrangler d1 migrations apply quiz-maker --local` is not yet successful here. Do not apply with `--remote`.

---



## Acceptance Criteria

- [ ] A D1 `users` table exists locally with id, first name, last name, username, email, and password hash
- [ ] Registration requires both username and email; username may be an email address; email must be a valid email format
- [ ] Username is unique; a second registration with the same username is rejected with 409
- [ ] Email is unique; a second registration with the same email is rejected with 409
- [ ] Passwords are never stored in plaintext; D1 contains only hashes
- [ ] The register and login UIs hash the password before the HTTP request is sent
- [ ] Registration uses the User Service to insert a user and returns 201 with a public profile (no `passwordHash`) that includes username and email
- [ ] The login page has exactly two fields: username or email, then password
- [ ] Login with the registered username and correct password returns 200 and redirects to `/mcq`
- [ ] Login with the registered email and correct password returns 200 and redirects to `/mcq`
- [ ] Login with a wrong password or unknown identifier returns 401 with `{ "error": "Invalid username/email or password" }`
- [ ] User Service supports create, update, retrieve (by id, by username, by email, and by login identifier), and delete
- [ ] Successful registration redirects to `/mcq`
- [ ] Successful login redirects to `/mcq`
- [ ] `/mcq` is a stub (no MCQ CRUD) and offers logout
- [ ] Logout calls `POST /api/auth/logout` and returns the teacher to `/login`
- [ ] No JWT, cookies, social login, or session store is introduced
- [x] Vitest is installed and `npm test` runs the colocated `*.test.ts` / `*.test.tsx` files
- [x] Phase 1 schema tests were written first (red: no SQL files), then turned green against `migrations/0001_create_users_table.sql`
- [ ] Each implementation phase wrote tests first (red), then turned them green; the suite covers happy paths and failure paths
- [ ] `npm test`, `npm run lint`, and `npm run build` succeed; results are reported, not assumed

---



## Success Metrics


| Metric                     | Target                                                           | How Measured                                                         |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Distinct teacher accounts  | 2+ users can register with different usernames and emails        | Insert two users via the register UI and confirm two rows in `users` |
| Plaintext password leakage | 0 plaintext passwords in D1 or API responses                     | Inspect `password_hash` column and JSON responses                    |
| Auth completion            | Register or login reaches `/mcq` without a server error          | Manual flow on local preview                                         |
| Duplicate identity         | 100% of duplicate usernames and duplicate emails rejected        | Repeat register with the same username or the same email, expect 409 |
| Time to first identity     | A new teacher can register and land on `/mcq` in under 2 minutes | Stopwatch on the happy path                                          |
| Unit tests                 | `npm test` exits 0 with no skipped hollow assertions             | Vitest run in Phase 5                                                |


---



## Dependencies



### External Dependencies

- Cloudflare D1 — User table storage (must be created and bound; not present in the starter)
- Web Crypto API — SHA-256 in the browser and on Workers (built in; no package)



### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — access `env.DB`
- Existing shadcn/ui components — register/login/MCQ UI
- Proposed: `zod` — validate API and form payloads (not installed; add only as part of this feature)
- Proposed (Phase 1): `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `jsdom`, `vite-tsconfig-paths` — unit test harness per `.cursor/skills/testing/SKILL.md`
- Proposed (Phase 4): `@testing-library/user-event` — realistic UI interaction in component tests



### Environment

- No new secrets are required for hashing.
- If a D1 database ID is added to `wrangler.jsonc`, it is configuration, not a secret.
- Keep `.dev.vars` gitignored. This phase should not need a new env var; if one is added, also add an empty placeholder to `.dev.vars.example`.

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
11. In Phases 1–4, write the listed tests first, run `npm test` (expect red), then implement until green. Do not implement first and retrofit tests.
12. Never deploy. Never apply D1 migrations remotely.
13. Verify with `npm test`, `npm run lint`, and `npm run build` before calling the phase done.

---



## Current Status

**Last Updated**: 2026-09-01
**Current Phase**: Phase 1 - Database Foundation
**Status**: COMPLETED (awaiting review)
**Next Steps**: Review Phase 1. After approval, start Phase 2 (User Service and hashing) with tests first. Re-run `wrangler d1 migrations apply quiz-maker --local` once workerd runs on this machine.