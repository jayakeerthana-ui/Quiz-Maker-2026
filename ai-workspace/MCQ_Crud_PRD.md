Date created: 2026-09-02
Date last modified: 2026-09-02

# MCQ CRUD - Technical PRD

## Overview/Problem

Quiz Maker’s authentication foundation lands teachers on a placeholder MCQ Management page (`/mcq`) that states question CRUD is not available yet. Teachers still have no way to create, inspect, edit, or remove multiple-choice questions, and there is no D1 schema for questions, answer choices, or recorded attempts. This feature replaces that stub with a shared test-bank workspace: a table of questions (short name plus the question stem), a dedicated create/edit page, a preview, deletion, attribution of each MCQ to the creating user, and the service/API layers needed to persist questions, choices, and attempts.

**As of 2026-09-02:** Phases 1–3 are complete on `feature/mcq-crud`. Schema, MCQ Service, and HTTP APIs exist; UI still uses the stub. Wait for review before Phase 4.

---

## Hypothesis

We believe that a shadcn table-and-form MCQ workspace, backed by a three-table D1 schema and an MCQ Service, will let teachers maintain a shared bank of multiple-choice questions without leaving the existing auth landing flow.

---

## Scope

This feature builds on `feature/user-authentication` (see `ai-workspace/USER_AUTHENTICATION_TECHNICAL_PRD.md`). Auth, hashing, register/login/logout, and the unguarded `/mcq` landing remain as they are. This sprint replaces the MCQ **stub**, not the auth stack.

### In Scope

- D1 migration for three tables: questions (`mcqs`), answer choices (`mcq_choices`), and attempts (`mcq_attempts`)
- MCQ entity: id, name, question (the prompt shown to the user), created-by user id, created at, updated at
- Choice entity: id, foreign key to the question, choice body, whether it is the correct answer, display position; **minimum 2** and **maximum 6** choices per question; **exactly one** choice marked correct
- Attempt entity: id, foreign keys to the question, the user, and the selected choice, plus whether that selection was correct at submit time, and created at
- MCQ Service as the only module that runs SQL for these three tables (create, read, update, delete questions and their choices; record and list attempts)
- HTTP APIs for MCQ CRUD and for recording and listing attempts
- Replace `/mcq` stub with a question table (name, question, Actions) plus a **Create MCQ** button and the existing **Log out** control
- Dedicated create/edit page with **Save** and **Cancel**
- Row Actions menu (three vertical dots): **Edit**, **Preview**, **Delete**
- Preview page: teacher-facing, read-only view of one question and its choices
- Delete confirmation (existing shadcn `dialog`) before the question is removed
- shadcn/ui: existing `table`, `button`, `card`, `field`, `input`, `label`, `dialog`, plus components proposed in Phase 4 (`dropdown-menu`, `textarea`)
- Vitest unit tests written with **TDD** in every implementation phase: failing tests first (**red**), then only enough product code to make them pass (**green**)

### Out of Scope

- Persistent authentication (JWT, cookies, sessions, route guards on `/mcq` or the APIs)
- Role-based access (any teacher can see and mutate the shared bank)
- Ownership-based access (only the creator may edit or delete); `created_by_user_id` is stored and returned, but every teacher can still see and mutate the shared bank
- Folders, tags, TEKS/standards alignment, or search/filter/pagination
- Multiple correct answers, true/false-only types, or question types other than single-correct MCQ
- Student-facing quiz runner, timed quizzes, scoring dashboards, or hiding the correct answer from the teacher
- Bulk import/export of questions
- AI-generated questions or any AI SDK usage
- New npm dependencies unless proposed at the start of a phase and approved

### Cut

- **Server-side protection of MCQ routes and APIs** — there is still no session; `/mcq` remains reachable by URL, matching the auth foundation. Do not add JWT or cookies to “fix” this here.
- **Changing `created_by_user_id` on update** — the author is set at create and is immutable. PUT must not accept or alter it.
- **Filtering the list by creator** — all teachers see all MCQs. Storing the author is not the same as scoping the bank.
- **A teacher-facing “Created by” input** — create/edit collect **Name**, **Question**, and choices only. `createdByUserId` is a required create-API field, not a form field the teacher types.
- **Attempt-taking UI (select an answer and submit from Preview)** — Preview is a teacher read-only inspection. Attempt **table, service, and APIs** are in this sprint so later student-taking can land on a stable contract; wiring a try-and-grade screen is a later sprint.
- **Updating or deleting an attempt** — attempts are an append-only record of what was chosen. “Managing” in this sprint means **create + list/get**.
- **Unique question names** — teachers may reuse titles; identity is the `id`.
- **Server Actions for MCQ mutations** — the Next.js workspace rule prefers Server Actions, but auth already uses App Router `handler.ts` + client `fetch`. This feature matches that tested pattern so UI tests can keep mocking `fetch`.
- **`@cloudflare/vitest-pool-workers`** — unit tests mock D1 / `getDb()`; do not change the Vitest harness.
- **`react-hook-form`** — forms use existing `field` primitives and local state, same as register/login.

---

## Technical Requirements

### Database Schema

Cloudflare D1 remains bound as `DB` in `wrangler.jsonc` to database `quiz-maker` (`eea14e86-b327-4629-a4cc-ab6225e01d39`). Worker name is `quiz-maker-2026`. The User table stays in `migrations/0001_create_users_table.sql`.

**Existing placeholder:** `migrations/0002_create_mcq_tables.sql` was created with Wrangler (header only, no `CREATE TABLE`). Phase 1 **must write the schema into this file**. Do not add `0003_*.sql` for the initial three tables. Apply migrations **locally only** (`--local`). Do not apply them remotely.

SQL table names are lowercase snake_case, matching `users`. Product names map as: **MCQ** → `mcqs`, **MCQ_Choices** → `mcq_choices`, **MCQ_Attempts** → `mcq_attempts`.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_mcqs_created_by_user_id ON mcqs (created_by_user_id);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  body TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);
CREATE UNIQUE INDEX idx_mcq_choices_mcq_id_position ON mcq_choices (mcq_id, position);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE RESTRICT
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts (user_id);
```

#### `mcqs`

| Column               | Type     | Rules                                                                                         |
| -------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `id`                 | TEXT     | Primary key, generated UUID-like hex blob                                                     |
| `name`               | TEXT     | Required, trimmed, 1–200 characters. Short label for the table and for identifying the MCQ    |
| `question`           | TEXT     | Required, trimmed, 1–2000 characters. The prompt presented to the user                        |
| `created_by_user_id` | TEXT     | Required FK to `users.id`. Set on create; never updated. **RESTRICT** user delete if they authored MCQs |
| `created_at`         | DATETIME | Set on insert                                                                                 |
| `updated_at`         | DATETIME | Set on insert and update                                                                      |


`name` is the short identifiable title. `question` is the stem shown in Preview and (truncated) in the table. There is no `description` column.


#### `mcq_choices`

| Column        | Type     | Rules                                                                 |
| ------------- | -------- | --------------------------------------------------------------------- |
| `id`          | TEXT     | Primary key, generated UUID-like hex blob                             |
| `mcq_id`      | TEXT     | Required FK to `mcqs.id`; cascade delete with the question            |
| `body`        | TEXT     | Required, trimmed, 1–500 characters                                   |
| `is_correct`  | INTEGER  | `0` or `1` only. Exactly one choice per question must be `1`          |
| `position`    | INTEGER  | 1-based display order, unique per `mcq_id`, in `1..choiceCount`       |
| `created_at`  | DATETIME | Set on insert                                                         |
| `updated_at`  | DATETIME | Set on insert and update                                              |


SQLite has no `BOOLEAN`; persist `is_correct` as `0`/`1`. The “exactly one correct” and “2–6 choices” rules are **service invariants**, not SQL `CHECK` constraints across rows.

#### `mcq_attempts`

| Column       | Type     | Rules                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `id`         | TEXT     | Primary key, generated UUID-like hex blob                                                      |
| `mcq_id`     | TEXT     | Required FK to `mcqs.id`; cascade delete with the question                                     |
| `user_id`    | TEXT     | Required FK to `users.id`; cascade delete with the user                                        |
| `choice_id`  | TEXT     | Required FK to `mcq_choices.id`; **RESTRICT** so a choice with attempts cannot be removed      |
| `is_correct` | INTEGER  | `0` or `1`; snapshot of whether `choice_id` was the correct choice **at submit time**          |
| `created_at` | DATETIME | Set on insert. Attempts are immutable; no `updated_at`                                         |


`is_correct` on the attempt is copied from the selected choice when the attempt is recorded. Later edits to the question must not rewrite historical attempt rows.

Deleting a question deletes its choices and attempts (`ON DELETE CASCADE` on `mcq_id`). Removing an individual choice that already has attempts must fail (FK RESTRICT) and surface as a 409 from the API. Deleting a user who authored MCQs fails (FK RESTRICT on `created_by_user_id`); deleting a user still cascades their **attempts**.

### API Endpoints

MCQ HTTP lives under `src/app/api/mcqs/` and `src/app/api/mcq-attempts/`. Route handlers must not run SQL. They validate with Zod, then call the MCQ Service.

**File split (required for tests):** Next.js’s TypeScript plugin cannot import App Router `route.ts` from Vitest. Each endpoint is implemented in `handler.ts` and re-exported from `route.ts`. Tests import `./handler`. Treat every input as untrusted.

JSON uses camelCase (`name`, `question`, `createdByUserId`, `isCorrect`, `createdAt`). D1 columns stay snake_case. Map in the service, same as `toPublicUser`.

#### GET /api/mcqs

Lists all questions for the management table. Choices are **not** required on this payload (keeps the list cheap). Newest first (`created_at DESC`).

**Request Body:** none

**Response:**

- Success (200):

```json
{
  "mcqs": [
    {
      "id": "a1b2c3d4e5f6a1b2",
      "name": "Photosynthesis inputs",
      "question": "Which inputs are required for photosynthesis?",
      "createdByUserId": "u1b2c3d4e5f6a1b2",
      "createdAt": "2026-09-02 12:00:00",
      "updatedAt": "2026-09-02 12:00:00"
    }
  ]
}
```

- Error (500): `{ "error": "Unable to list questions" }`

#### POST /api/mcqs

Creates a question and its choices in one request. The service must persist them together (D1 `batch`) so a question is never stored without its choices.

**Request Body:**

```json
{
  "name": "Photosynthesis inputs",
  "question": "Which inputs are required for photosynthesis?",
  "createdByUserId": "u1b2c3d4e5f6a1b2",
  "choices": [
    { "body": "Water and carbon dioxide", "isCorrect": true, "position": 1 },
    { "body": "Oxygen and nitrogen", "isCorrect": false, "position": 2 }
  ]
}
```

**Behavior:**

1. Validate with Zod (`createMcqBodySchema`): `name` required 1–200; `question` required 1–2000; `createdByUserId` required non-empty string; `choices` length 2–6; each `body` 1–500; `isCorrect` boolean; `position` integer ≥ 1.
2. Reject unless **exactly one** `choices[].isCorrect` is `true`.
3. Reject unless positions are unique and form a contiguous sequence `1..n`.
4. Call MCQ Service `createMcq`. Unknown `createdByUserId` is 404, not 500.
5. Return the created question **with** choices (201), including `createdByUserId`.

There is no session; `createdByUserId` is a required body field (same trust model as attempt `userId` and unguarded `/mcq`).

**Response:**

- Success (201): `{ "mcq": { ...question, "choices": [ ... ] } }` (see GET by id shape)
- Error (400): validation failure (`{ "error": "..." }`)
- Error (404): `{ "error": "User not found" }` when `createdByUserId` does not match a `users` row
- Error (500): `{ "error": "Unable to create question" }`

#### GET /api/mcqs/:id

Returns one question and its choices, ordered by `position` ascending. Used by Edit and Preview.

**Response:**

- Success (200):

```json
{
  "mcq": {
    "id": "a1b2c3d4e5f6a1b2",
    "name": "Photosynthesis inputs",
    "question": "Which inputs are required for photosynthesis?",
    "createdByUserId": "u1b2c3d4e5f6a1b2",
    "createdAt": "2026-09-02 12:00:00",
    "updatedAt": "2026-09-02 12:00:00",
    "choices": [
      {
        "id": "c111111111111111",
        "body": "Water and carbon dioxide",
        "isCorrect": true,
        "position": 1
      },
      {
        "id": "c222222222222222",
        "body": "Oxygen and nitrogen",
        "isCorrect": false,
        "position": 2
      }
    ]
  }
}
```

- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Unable to load question" }`

#### PUT /api/mcqs/:id

Replaces name, question, and the choice set. Does **not** accept or change `createdByUserId`. Choice **ids** in the payload are stable:

- Object **with** `id` → update that row (must belong to this question)
- Object **without** `id` → insert a new choice
- Existing rows whose ids are omitted → delete, unless an attempt references them (409)

Same 2–6 / exactly-one-correct / contiguous-position rules as create. Set `mcqs.updated_at`.

**Request Body:** same as POST **except** `createdByUserId` is omitted (ignored if sent). Each choice may include `"id"`.

**Response:**

- Success (200): `{ "mcq": { ... } }` (same shape as GET by id)
- Error (400): validation failure
- Error (404): `{ "error": "Question not found" }`
- Error (409): `{ "error": "Cannot remove a choice that has recorded attempts" }`
- Error (500): `{ "error": "Unable to update question" }`

#### DELETE /api/mcqs/:id

Deletes the question. Choices and attempts cascade in D1.

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `{ "error": "Question not found" }`
- Error (500): `{ "error": "Unable to delete question" }`

#### POST /api/mcq-attempts

Records one attempt. There is no session; `userId` is a required body field (same trust model as unguarded `/mcq`). The handler must **not** trust a client-supplied `isCorrect`; the service computes it from the stored choice.

**Request Body:**

```json
{
  "mcqId": "a1b2c3d4e5f6a1b2",
  "userId": "u1b2c3d4e5f6a1b2",
  "choiceId": "c111111111111111"
}
```

**Behavior:**

1. Validate ids are non-empty strings.
2. Service loads the choice; it must exist and belong to `mcqId`.
3. Service verifies `userId` exists in `users` (unknown user → 404).
4. Persist `is_correct` from that choice’s `is_correct`.
5. Return the attempt (201).

**Response:**

- Success (201):

```json
{
  "attempt": {
    "id": "t111111111111111",
    "mcqId": "a1b2c3d4e5f6a1b2",
    "userId": "u1b2c3d4e5f6a1b2",
    "choiceId": "c111111111111111",
    "isCorrect": true,
    "createdAt": "2026-09-02 12:05:00"
  }
}
```

- Error (400): validation failure
- Error (404): `{ "error": "Question not found" }` / `{ "error": "Choice not found" }` / `{ "error": "User not found" }` (distinct messages so tests can tell them apart; do not use this as a login oracle — there is still no session)
- Error (500): `{ "error": "Unable to record attempt" }`

#### GET /api/mcq-attempts

Lists attempts. Require **exactly one** filter query so the endpoint cannot dump the whole table:

- `?mcqId=` — all attempts for a question, newest first
- `?userId=` — all attempts for a user, newest first

**Response:**

- Success (200): `{ "attempts": [ ... ] }` (same object shape as POST)
- Error (400): `{ "error": "Provide exactly one of mcqId or userId" }`
- Error (500): `{ "error": "Unable to list attempts" }`

#### GET /api/mcq-attempts/:id

**Response:**

- Success (200): `{ "attempt": { ... } }`
- Error (404): `{ "error": "Attempt not found" }`
- Error (500): `{ "error": "Unable to load attempt" }`

### MCQ Service

Domain logic lives in `src/lib/services/mcq-service.ts`. Access D1 only through `getDb()` in `src/lib/db.ts`. Use prepared statements with numbered placeholders (`?1`, `?2`). Prefer `all()` and `results[0]` over `first()`. Use `db.batch()` for create/update that touch `mcqs` and `mcq_choices` together.

Typed errors (mirror `UserConflictError`):

| Error                    | When                                              | Typical HTTP |
| ------------------------ | ------------------------------------------------- | ------------ |
| `McqNotFoundError`       | Unknown question / choice / user / attempt        | 404          |
| `McqValidationError`     | Choice count, missing correct, bad positions      | 400          |
| `McqChoiceInUseError`    | Deleting a choice that has attempts               | 409          |


| Method | Responsibility | Code |
| ------ | -------------- | ---- |
| `listMcqs()` | All questions, no choices, `created_at DESC` | `src/lib/services/mcq-service.ts:220` |
| `getMcqById(id)` | Question plus choices ordered by `position`, or `null` | `src/lib/services/mcq-service.ts:227` |
| `createMcq({ name, question, createdByUserId, choices })` | Verify `createdByUserId` exists in `users`; insert question + choices; enforce 2–6, exactly one correct, contiguous positions | `src/lib/services/mcq-service.ts:236` |
| `updateMcq(id, { name, question, choices })` | Update name, question, and choices only (do not change `created_by_user_id`); insert/update/delete choices as specified; set `updated_at`; throw `McqChoiceInUseError` if a removed choice has attempts | `src/lib/services/mcq-service.ts:276` |
| `deleteMcq(id)` | Delete question; return whether a row was removed (cascades choices and attempts) | `src/lib/services/mcq-service.ts:357` |
| `createAttempt({ mcqId, userId, choiceId })` | Verify user, question, and that the choice belongs to the question; store snapshot `is_correct` | `src/lib/services/mcq-service.ts:366` |
| `listAttemptsByMcqId(mcqId)` | Attempts for a question, newest first | `src/lib/services/mcq-service.ts:402` |
| `listAttemptsByUserId(userId)` | Attempts for a user, newest first | `src/lib/services/mcq-service.ts:410` |
| `getAttemptById(id)` | One attempt or `null` | `src/lib/services/mcq-service.ts:418` |

Map rows with `toPublicMcq` / `toPublicChoice` / `toPublicAttempt` (`is_correct` → `isCorrect` boolean; `created_by_user_id` → `createdByUserId`).

Trim `name`, `question`, and choice `body` in the service (in addition to Zod) so direct service callers cannot persist padding.

### Validation (Zod)

Add `src/lib/mcq-schemas.ts` (do not overload `auth-schemas.ts`). Reuse `firstZodError` from `src/lib/auth-schemas.ts` **or** move that helper to a tiny shared module only if both files would otherwise duplicate it. Prefer importing `firstZodError` from `auth-schemas.ts` to avoid a new file unless a cycle appears.

Schemas to define:

- `createMcqBodySchema` / `updateMcqBodySchema` (create requires `createdByUserId`; update must **not** require or persist `createdByUserId`; update allows optional `id` on each choice)
- `createAttemptBodySchema`
- Path/query helpers as needed (`mcqId`, `userId`)

### Testing (Vitest and TDD)

Vitest is already installed from the auth foundation. Follow `.cursor/skills/testing/SKILL.md`. Do **not** reinstall Vitest, Testing Library, or jsdom. Prefer `userEvent` over `fireEvent`.

#### TDD approach (required for Phases 1–4)

Tests define the contract. Product code is written only after those tests exist and have been seen to fail. Do not implement first and retrofit tests. A green suite that was tuned to already-written code does not count as TDD.

**Cycle for every implementation phase:**

1. **Red.** Write the phase's colocated tests from this PRD (happy path and failure path). Run `npm test`. They **must fail** for a real reason: missing module, empty migration, unmet assertion, or wrong status/JSON. If the new tests pass on the first run, they are not proving new behavior — tighten them until they can fail.
2. **Implement.** Write only enough product code to address those failures. Do not add sessions, AI, pagination, or extra question types “while you are here.”
3. **Green.** Re-run `npm test`. The phase's tests must pass. Existing auth tests must stay green (no regressions).
4. **Done when** the suite is green **and** that phase's acceptance criteria hold. Hollow assertions (`expect(true).toBe(true)`) do not count. Inspection without `npm test` does not count.

**What “red” looks like on this feature:**

| Phase | Tests written first | Typical first failure |
| --- | --- | --- |
| 1 | `migrations/mcq.schema.test.ts` | `0002` has no `CREATE TABLE`, missing FKs/indexes, or wrong columns |
| 2 | `src/lib/services/mcq-service.test.ts` | Missing module, or create/list/update/delete/attempt behavior unimplemented |
| 3 | `src/app/api/mcqs/**/route.test.ts`, `src/app/api/mcq-attempts/**/route.test.ts` (import `./handler`) | Missing handlers or wrong status/body (201/200/400/404/409) |
| 4 | `src/components/mcq-*.test.tsx` | Stub still rendered; no table/Create/ellipsis/form/preview; logout gone |
| 5 | No new red suite unless a gap is found | Run the accumulated suite as the completion gate |

**Commands:** `npm test` (`vitest run`) for the gate; `npm test:watch` while iterating. After green, also run `npm run lint` and `npm run build` before calling a phase done.

Auth schema tests read **all** `*.sql` files. New MCQ assertions must not break `migrations/users.schema.test.ts`. The MCQ schema test should still scan SQL files (same helper pattern) and assert on `mcqs` / `mcq_choices` / `mcq_attempts`.

#### Conventions

- Colocate tests: `mcq-service.ts` → `mcq-service.test.ts`; UI the same.
- Assert observable output and side effects (HTTP status, nested `choices`, `isCorrect` boolean not `0`/`1` in JSON, cascade vs restrict). Cover failure paths (validation, missing rows, choice-in-use 409), not only the happy path.
- Name tests so a failure message explains what broke.
- Each test must pass alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
- Mock at the module boundary. Never hit a real D1 database or network in a unit test. Service tests mock `@/lib/db`. Route tests mock the MCQ Service. UI tests mock `fetch` and `next/navigation`.
- `getCloudflareContext()` does not work under jsdom. Keep D1 behind `src/lib/`.
- Mock `server-only` with `vi.mock("server-only", () => ({}))` if a subject imports it.
- Query React UI by role and accessible name. Server Components cannot be rendered by Testing Library; reserve `render` for Client Components.
- App Router `route.ts` cannot be imported from Vitest. Put handlers in `handler.ts`, re-export from `route.ts`, import `./handler` in `route.test.ts`.
- Replace `src/components/mcq-stub.test.tsx` when `McqStub` is removed. Logout behavior must still be tested on the list page.

### User Interface Requirements

Styling is **Tailwind CSS v4** via existing utilities and theme tokens in `src/app/globals.css`. Do not add hard-coded hex colors. Do not add a CSS-in-JS library or `react-hook-form`.

**Already installed** (`src/components/ui/`): `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`, `table`.

**Propose in Phase 4 before adding** (shadcn CLI, `@shadcn/` namespace, Base UI / `base-nova`):

- `dropdown-menu` — Actions ellipsis
- `textarea` — question stem on create/edit

If `dropdown-menu` or `textarea` is missing for this base, stop and say so; do not invent a parallel menu or a raw unstyled textarea as the long-term design. Native `<textarea>` inside `Field` is an acceptable **fallback** only if the shadcn add fails, and must still use theme tokens.

Icons: Lucide `EllipsisVertical` (three vertical dots) for Actions. Do not use a text “…” button without an accessible name.

**Page vs client split:** App Router pages stay Server Components. Interactive table, menus, forms, and dialogs are Client Components (`'use client'` as far down the tree as possible). Do not import the MCQ Service, `getDb`, or `getCloudflareContext` into a client file.

**Shared form behavior (create/edit):** `noValidate` on the `<form>` so native tooltips do not replace `FieldError`. `required` remains on name, question, and each choice body for accessibility. Submit is disabled while the request is in flight. One form-level `FieldError` (`role="alert"`) shows client validation and 400/404/409/500 messages.

**Logout:** remains on the management list only (not on create/edit/preview). Same contract as auth: `POST /api/auth/logout`, then `router.push("/login")`, including when the request fails.

#### MCQ list (/mcq)

- Replace `McqStub` / centered `max-w-sm` card. Use a wider shell (for example `max-w-5xl`) so the table is usable.
- Page title: **MCQ Management**.
- Header row: title + **Create MCQ** (primary button) + outline **Log out**.
- **Create MCQ** navigates to `/mcq/new`.
- shadcn `Table` with columns: **Name**, **Question**, **Actions**.
- Question text in the table may be truncated visually (`line-clamp-2`).
- Empty state: table (or a single full-width row) with copy such as “No questions yet. Create an MCQ to start the shared test-bank.” **Create MCQ** still visible.
- Actions column: icon button `aria-label="Actions"` (or `Actions for {name}`) opening a dropdown:
  - **Edit** → `/mcq/[id]/edit`
  - **Preview** → `/mcq/[id]/preview`
  - **Delete** → opens confirm dialog (does not delete immediately)
- Delete dialog: title “Delete question?”; body uses the question name; buttons **Cancel** and **Delete**. Confirm calls `DELETE /api/mcqs/:id`, then refreshes the list (or removes the row). On failure, show an error; do not close as success.
- Load list with `GET /api/mcqs` on mount. Show a simple loading state; on fetch failure, show a visible error (not a blank page).

#### Create MCQ (/mcq/new)

- Files: `src/app/mcq/new/page.tsx` + shared form Client Component (same component as edit).
- Title: **Create MCQ**.
- Fields:
  1. **Name** (`name`, `Input`, required, 1–200) — short identifiable label. Helper: “A short name for this MCQ in the table.”
  2. **Question** (`question`, `Textarea`, required, 1–2000) — the prompt presented to the user. Helper: “This is the question text shown in preview.”
  3. **Choices** — start with **two** rows. Each row: choice body (`Input`, required) and a control to mark **this** row as the correct answer (radio or exclusive toggle; exactly one selected). Rows numbered from 1 to match `position`.
- Do **not** show a Created-by field. The form receives `createdByUserId` as a Client Component prop (from the page). The create page may read optional search param `userId` (`/mcq/new?userId=…`) and pass it through. If that prop is missing, Save shows a form-level error and does not `POST`.
- **Add choice** adds a row until 6; the control is disabled or hidden at 6. Helper text: “2 to 6 choices. Exactly one must be marked correct.”
- **Remove** on a row is available only when there are more than 2 choices.
- Default: first choice marked correct so the form is submittable without an extra click; the teacher can change it.
- Actions: **Save** (submit) and **Cancel**. Cancel navigates to `/mcq` without `fetch`.
- Save: `POST /api/mcqs` with `{ name, question, createdByUserId, choices: [{ body, isCorrect, position }] }`. On 201, `router.push("/mcq")`. Do not navigate on 400/404/500.

#### Edit MCQ (/mcq/[id]/edit)

- Same form as create. Title: **Edit MCQ**.
- Load `GET /api/mcqs/:id`. Unknown id: visible “Question not found” and a way back to `/mcq` (link or button). Do not show an empty form that would create a new row.
- Save: `PUT /api/mcqs/:id` including choice `id`s that came from the server; new rows omit `id`. On 200, `router.push("/mcq")`. Surface 409 choice-in-use on the form.

#### Preview (/mcq/[id]/preview)

- Title: **Preview**.
- Load `GET /api/mcqs/:id`. Show **name** (as a heading), **question** (the stem), and choices in `position` order.
- This is a teacher preview: indicate the correct choice (existing `badge`, for example “Correct”). Do not include Save. Do not POST an attempt from this page.
- **Back** (or equivalent) to `/mcq`. Unknown id: same not-found treatment as edit.
- Choices are not editable.

#### Routes that must exist after this feature

| Route | Purpose |
| ----- | ------- |
| `/mcq` | List + create button + logout |
| `/mcq/new` | Create |
| `/mcq/[id]/edit` | Edit |
| `/mcq/[id]/preview` | Preview |

`/login`, `/register`, `/`, and `/api/auth/*` are unchanged.

---

## Implementation Phases

Every implementation phase below follows the **TDD** cycle in Testing: write tests first (expect **red**), implement, then **green**. The phase is done when those tests are green **and** the listed acceptance criteria hold.

Do not start Phase 2 until Phase 1 has been reviewed.

### Phase 1: Database Foundation - COMPLETED

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` with the columns, FKs, and indexes in this PRD.

**Tests first (expect RED):**

1. Add `migrations/mcq.schema.test.ts` that reads migration SQL (same filesystem approach as `migrations/users.schema.test.ts`) and asserts:
   - `CREATE TABLE` for `mcqs`, `mcq_choices`, `mcq_attempts`
   - `mcqs` columns: `id`, `name`, `question`, `created_by_user_id`, `created_at`, `updated_at` (and **no** `description` column)
   - `mcq_choices` columns: `id`, `mcq_id`, `body`, `is_correct`, `position`, `created_at`, `updated_at`
   - `mcq_attempts` columns: `id`, `mcq_id`, `user_id`, `choice_id`, `is_correct`, `created_at` (and **no** `updated_at`)
   - foreign keys: `mcqs.created_by_user_id` → `users(id)`; choices → `mcqs(id)`; attempts → `mcqs(id)`, `users(id)`, `mcq_choices(id)`
   - index on `mcqs(created_by_user_id)`
   - index on `mcq_choices(mcq_id)` and unique `(mcq_id, position)`
   - indexes on `mcq_attempts(mcq_id)` and `mcq_attempts(user_id)`
2. Run `npm test`. Expect **red** (`0002` is currently header-only).

**Implementation:**

1. Write the `CREATE TABLE` / index SQL into existing `migrations/0002_create_mcq_tables.sql`
2. Apply **locally only**: `npx wrangler d1 migrations apply quiz-maker --local`
3. Do not run `cf-typegen` unless bindings change (they should not)

**Done when:**

- `npm test` is **green** for the new schema tests and existing user schema tests — **met** (42 passed, 10 files, 2026-09-02; 6 new MCQ schema tests after red: 6 failed on header-only `0002`)
- Local apply succeeds on a machine with working `workerd`, or the failure is the known Windows `write EOF` issue (then report it; do not apply `--remote`) — **partial**: `npx wrangler d1 migrations apply quiz-maker --local` reported **No migrations to apply**. Local D1 already had `mcqs` / `mcq_choices` / `mcq_attempts` from an earlier apply of `0002`, but `PRAGMA table_info(mcqs)` still shows `description` and **no** `question` / `created_by_user_id`. Wrangler will not re-run `0002`. No `0003` was added. Remote was not touched. See Troubleshooting.

**What shipped:**

- `migrations/0002_create_mcq_tables.sql:3` — `mcqs` (`question`, `created_by_user_id`); `mcq_choices` at `:15`; `mcq_attempts` at `:29`; indexes at `:13`, `:26`–`:27`, `:41`–`:42`
- `migrations/mcq.schema.test.ts:55` — six SQL assertions (tables, columns, no `description` / no attempt `updated_at`, FKs, indexes)

**Local D1 repair (after review, local only):** delete the local Wrangler D1 directory (`.wrangler/state/v3/d1`) and re-run `npx wrangler d1 migrations apply quiz-maker --local` so `0001` and the filled `0002` apply together. Do not apply `--remote`. Do not add `0003` for this schema.

**Deliverables:**

- `migrations/0002_create_mcq_tables.sql` filled in
- `migrations/mcq.schema.test.ts`

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` with the columns, FKs, and indexes in this PRD.

**Tests first (expect RED):**

1. Add `migrations/mcq.schema.test.ts` that reads migration SQL (same filesystem approach as `migrations/users.schema.test.ts`) and asserts:
   - `CREATE TABLE` for `mcqs`, `mcq_choices`, `mcq_attempts`
   - `mcqs` columns: `id`, `name`, `question`, `created_by_user_id`, `created_at`, `updated_at` (and **no** `description` column)
   - `mcq_choices` columns: `id`, `mcq_id`, `body`, `is_correct`, `position`, `created_at`, `updated_at`
   - `mcq_attempts` columns: `id`, `mcq_id`, `user_id`, `choice_id`, `is_correct`, `created_at` (and **no** `updated_at`)
   - foreign keys: `mcqs.created_by_user_id` → `users(id)`; choices → `mcqs(id)`; attempts → `mcqs(id)`, `users(id)`, `mcq_choices(id)`
   - index on `mcqs(created_by_user_id)`
   - index on `mcq_choices(mcq_id)` and unique `(mcq_id, position)`
   - indexes on `mcq_attempts(mcq_id)` and `mcq_attempts(user_id)`
2. Run `npm test`. Expect **red** (`0002` is currently header-only).

**Implementation:**

1. Write the `CREATE TABLE` / index SQL into existing `migrations/0002_create_mcq_tables.sql`
2. Apply **locally only**: `npx wrangler d1 migrations apply quiz-maker --local`
3. Do not run `cf-typegen` unless bindings change (they should not)

**Done when:**

- `npm test` is **green** for the new schema tests and existing user schema tests
- Local apply succeeds on a machine with working `workerd`, or the failure is the known Windows `write EOF` issue (then report it; do not apply `--remote`)

**Deliverables:**

- `migrations/0002_create_mcq_tables.sql` filled in
- `migrations/mcq.schema.test.ts`

### Phase 2: MCQ Service - COMPLETED

**Objective**: Questions, choices, and attempts can be created, read, updated, and deleted through the service; invariants are enforced in one place.

**Tests first (expect RED):**

1. Add `src/lib/services/mcq-service.test.ts` with mocked `getDb()` / fake D1:
   - `createMcq` persists name, question, `createdByUserId`, and 2+ choices; public object uses camelCase and boolean `isCorrect`
   - `createMcq` rejects unknown `createdByUserId`
   - `createMcq` rejects fewer than 2 choices, more than 6, zero correct, two correct, and duplicate/gapped positions
   - `listMcqs` returns questions without requiring choice rows in that result (includes `question` and `createdByUserId`)
   - `getMcqById` returns choices ordered by `position`, or `null`
   - `updateMcq` changes name/question, inserts a new choice, updates an existing choice body, deletes an unused choice; does **not** change `createdByUserId`
   - `updateMcq` throws `McqChoiceInUseError` when removing a choice that has attempts
   - `deleteMcq` removes the question (and, via the fake DB, associated choices)
   - `createAttempt` stores `isCorrect` from the choice, not from the caller
   - `createAttempt` rejects unknown user, unknown question, or a choice that belongs to a different question
   - `listAttemptsByMcqId` / `listAttemptsByUserId` / `getAttemptById` cover hit and miss
2. Run `npm test`. Expect **red**.

**Implementation:**

1. Implement `src/lib/services/mcq-service.ts` against D1 with numbered placeholders and `batch` where a question and its choices must stay together
2. Map DB rows to public objects
3. Throw the typed errors in this PRD

**Done when:**

- `npm test` is **green** for MCQ Service tests plus Phase 1 and auth suites — **met** (53 passed, 11 files, 2026-09-02). First run was **red** (failed to resolve `@/lib/services/mcq-service`).
- No unit test talks to a real D1 database — **met** (`mcq-service.test.ts` mocks `@/lib/db`)

**What shipped:**

- `src/lib/services/mcq-service.ts` — `McqNotFoundError` at `:5`; `McqValidationError` at `:21`; `McqChoiceInUseError` at `:28`; `createMcq` at `:236` (D1 `batch`); `updateMcq` at `:276`; `createAttempt` at `:366` snapshots `is_correct` from the stored choice
- `src/lib/services/mcq-service.test.ts:275` — eleven tests against an in-memory fake D1

**Deliverables:**

- `src/lib/services/mcq-service.ts`
- `src/lib/services/mcq-service.test.ts`

### Phase 3: MCQ and Attempt APIs - COMPLETED

**Objective**: HTTP endpoints consume the MCQ Service with the status codes in this PRD.

**Tests first (expect RED):**

1. Zod is already a dependency; add `src/lib/mcq-schemas.ts` as part of this phase (schemas can live next to the first failing handler tests).
2. Add route tests that call handlers with `Request` objects and **mock the MCQ Service** (not D1):
   - `GET /api/mcqs` → 200 `{ mcqs }`
   - `POST /api/mcqs` → 201 with choices and `createdByUserId`; 400 when name or question missing, when `createdByUserId` missing, when only one choice, when two corrects; 404 when creator user does not exist
   - `GET /api/mcqs/:id` → 200 with choices; 404 when service returns null
   - `PUT /api/mcqs/:id` → 200; 404; 409 `McqChoiceInUseError`; `createdByUserId` in the body is ignored (author unchanged)
   - `DELETE /api/mcqs/:id` → 200 `{ ok: true }`; 404
   - `POST /api/mcq-attempts` → 201; `isCorrect` comes from the service return, not the request body; 400 missing fields; 404 mapped from `McqNotFoundError`
   - `GET /api/mcq-attempts` → 200 with filter; 400 when neither or both query params
   - `GET /api/mcq-attempts/:id` → 200; 404
3. Run `npm test`. Expect **red**.

**Implementation:**

1. Add `handler.ts` + thin `route.ts` for each method/path
2. Validate input with Zod; map typed service errors to 400/404/409/500
3. Never return snake_case DB rows

**Suggested files:**

- `src/app/api/mcqs/handler.ts` — `GET` (list), `POST` (create)
- `src/app/api/mcqs/route.ts`
- `src/app/api/mcqs/[id]/handler.ts` — `GET`, `PUT`, `DELETE`
- `src/app/api/mcqs/[id]/route.ts`
- `src/app/api/mcq-attempts/handler.ts` — `GET` (list), `POST` (create)
- `src/app/api/mcq-attempts/route.ts`
- `src/app/api/mcq-attempts/[id]/handler.ts` — `GET`
- `src/app/api/mcq-attempts/[id]/route.ts`

**Done when:**

- `npm test` is **green** for the new route suites — **met** (72 passed, 15 files, 2026-09-02). First run was **red** (missing `./handler`).
- Failure-path tests exist (not only 201/200) — **met** (400, 404, 409)

**What shipped:**

- `src/lib/mcq-schemas.ts:40` — `createMcqBodySchema`; `updateMcqBodySchema` at `:47`; `createAttemptBodySchema` at `:53`
- `src/app/api/mcqs/handler.ts:11` — `GET` list; `POST` at `:20` (201 via `createMcq`; 400 Zod; 404 `McqNotFoundError`)
- `src/app/api/mcqs/[id]/handler.ts:17` — `GET`; `PUT` at `:30` (strips `createdByUserId`); `DELETE` at `:61`
- `src/app/api/mcq-attempts/handler.ts:12` — `GET` list (exactly one filter); `POST` at `:36` (does not pass client `isCorrect`)
- `src/app/api/mcq-attempts/[id]/handler.ts:8` — `GET` one attempt
- Thin `route.ts` re-exports; colocated `route.test.ts` files mock the MCQ Service, not D1

**Deliverables:**

- `src/lib/mcq-schemas.ts`
- Route handlers and colocated `route.test.ts` files

### Phase 4: MCQ UI - PLANNED

**Objective**: Teachers can list, create, edit, preview, and delete questions from the app, and still log out.

**Tests first (expect RED):**

1. Propose adding shadcn `dropdown-menu` and `textarea` (`npx shadcn@latest add @shadcn/dropdown-menu` and `@shadcn/textarea`). Install only after approval.
2. Add Client Component tests (`*.test.tsx`) that query by role and accessible name:
   - List: heading MCQ Management; **Create MCQ** navigates to `/mcq/new`; table headers Name, Question, Actions; rows render fetched name and question; empty copy when `mcqs: []`; Actions menu contains Edit, Preview, Delete; Delete confirms then `DELETE`s; **Log out** still `POST /api/auth/logout` and goes to `/login` even on failure
   - Create form: Name and Question required; two choice rows by default; Add choice until 6; cannot remove below 2; Save `POST`s `/api/mcqs` including `createdByUserId` and navigates to `/mcq` on 201; Cancel goes to `/mcq` without POST; validation error is shown and does not navigate
   - Edit form: loads GET by id into Name, Question, and choices; Save `PUT`s name/question/choices (no `createdByUserId`) and navigates on 200
   - Preview: shows name, question stem, choices; indicates the correct choice; no Save
3. Mock `fetch` and navigation. Do not boot Next.js or D1.
4. Remove or replace `mcq-stub.test.tsx` so the suite does not assert that CRUD is absent.
5. Run `npm test`. Expect **red**.

**Implementation:**

1. Add approved shadcn components
2. Build list, form, preview Client Components and the App Router pages in User Interface Requirements
3. Delete `src/components/mcq-stub.tsx` once the list page owns logout
4. Wire loading, empty, not-found, and error states

**Done when:**

- `npm test` is **green** for the UI suites, including logout
- Stub copy (“Question CRUD is not available yet”) is gone from `/mcq`

**Deliverables:**

- List / form / preview components and pages
- Colocated UI tests
- `McqStub` removed

### Phase 5: Verification - PLANNED

**Objective**: The feature is proven by a green Vitest suite, lint, build, and a real teacher flow — not inspection alone.

**Tests first:**

This phase does not add a new red suite. It runs the accumulated tests as the completion gate.

1. Run `npm test` and confirm **all** phase tests are green (auth + MCQ). If any are red, return to that phase.
2. If a gap is found (an acceptance criterion with no test), write that test first (red), then fix (green) before continuing.

**Implementation / verification:**

1. Run `npm run lint` and `npm run build` and record the actual result
2. Exercise: login → `/mcq` empty or populated → Create MCQ (name + question + 2 choices, then add to 3) → Save → row in table shows name and question → Edit → Save → Preview shows stem and correct badge → Delete with confirm → row gone → Log out → `/login`
3. Exercise API failure paths with unit tests already in place; optionally `curl` 400 (one choice) and 404 (unknown id) against `npm run preview` when Workers D1 is available
4. Confirm local D1 has rows in `mcqs` / `mcq_choices` after a successful create (when local migrations apply)

**Done when:**

- `npm test` is green
- `npm run lint` and `npm run build` succeed (report actual counts/warnings)
- Manual happy path matches the acceptance criteria

**Deliverables:**

- This PRD updated with results, file paths, and phase status (`COMPLETED`)
- Troubleshooting entries for any bugs actually hit

---

## Technical Implementation Details

### Key Files (planned)

Fill line references as code is written. Until then, paths are the contract.

- `migrations/0002_create_mcq_tables.sql:3` — `mcqs`; `mcq_choices` at `:15`; `mcq_attempts` at `:29`
- `migrations/mcq.schema.test.ts:55` — schema tests (read SQL; no live D1)
- `src/lib/db.ts` — existing `getDb()`; reuse, do not duplicate
- `src/lib/services/mcq-service.ts` — only module that talks to D1 for MCQ/choices/attempts (`McqNotFoundError` at `:5`; `createMcq` at `:236`; `updateMcq` at `:276`; `createAttempt` at `:366`)
- `src/lib/services/mcq-service.test.ts:27` — mocks `@/lib/db`; suite at `:275`
- `src/lib/mcq-schemas.ts:40` — `createMcqBodySchema`; `updateMcqBodySchema` at `:47`; `createAttemptBodySchema` at `:53`
- `src/app/api/mcqs/handler.ts:11` — list `GET`; `POST` at `:20`; `src/app/api/mcqs/route.ts:1` re-export
- `src/app/api/mcqs/[id]/handler.ts:17` — `GET` / `PUT` / `DELETE`
- `src/app/api/mcq-attempts/handler.ts:12` — list `GET` / record `POST`
- `src/app/api/mcq-attempts/[id]/handler.ts:8` — get one attempt
- `src/app/mcq/page.tsx` — list page (replaces stub)
- `src/app/mcq/new/page.tsx` — create page
- `src/app/mcq/[id]/edit/page.tsx` — edit page
- `src/app/mcq/[id]/preview/page.tsx` — preview page
- `src/components/mcq-list.tsx` (or equivalent) — table, create button, logout, actions menu, delete dialog
- `src/components/mcq-form.tsx` — shared create/edit form
- `src/components/mcq-preview.tsx` — read-only preview
- `src/components/mcq-stub.tsx` — **remove** in Phase 4

Auth files are unchanged except that `/mcq` no longer mounts `McqStub`.

### Implementation Patterns

```typescript
export { GET, POST } from "./handler";
```

```sql
-- numbered placeholders only
INSERT INTO mcqs (name, question, created_by_user_id) VALUES (?1, ?2, ?3);
INSERT INTO mcq_choices (mcq_id, body, is_correct, position)
VALUES (?1, ?2, ?3, ?4);
```

```typescript
await db.batch([
  db.prepare("INSERT INTO mcqs (id, name, question, created_by_user_id) VALUES (?1, ?2, ?3, ?4)").bind(id, name, question, createdByUserId),
  ...choices.map((choice, index) =>
    db.prepare(
      "INSERT INTO mcq_choices (mcq_id, body, is_correct, position) VALUES (?1, ?2, ?3, ?4)",
    ).bind(id, choice.body, choice.isCorrect ? 1 : 0, index + 1),
  ),
]);
```

```tsx
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
```

Dynamic App Router params for `/mcq/[id]/edit` are `Promise<{ id: string }>` in this Next.js version; unwrap with `await params` in the Server Component page and pass `id` into the client form.

### Important Notes

- D1 is server-only. Never import the MCQ Service or `getCloudflareContext` into a `'use client'` file.
- `npm run dev` runs on Node and will not exercise Workers/D1 the same way as production. Verify database-backed paths with `npm run preview` when possible.
- Ask before adding dependencies. Zod and Vitest are already present. Phase 4 must propose shadcn `dropdown-menu` and `textarea` before running the CLI.
- Do not deploy. Do not apply D1 migrations with `--remote`.
- Do not hand-edit `cloudflare-env.d.ts`, `next-env.d.ts`, or `package-lock.json`.
- `/mcq` is still not a protected resource.
- `createdByUserId` on create and `userId` on attempts are client-supplied until a session sprint exists. Do not store a fake session in `localStorage` to paper over that.
- The create form does not include a Created-by input. `/mcq/new` may read optional search param `userId` and pass it as the `createdByUserId` prop so Phase 5 can create a row without adding cookies. Login/register redirects do not have to change.
- There is no `description` column or JSON field. Use `question` for the stem and `name` for the short label.
- Mixing anonymous `?` and numbered `?1` placeholders causes Wrangler binding errors. Use numbered placeholders only.
- `@vitejs/plugin-react` stays on **v5**. Do not bump it.
- Update `AGENTS.md` project blurb only when this feature is actually implemented (after approval), so agents stop calling `/mcq` a stub.

---

## Acceptance Criteria

- [x] `mcqs`, `mcq_choices`, and `mcq_attempts` exist in the local D1 migration with the columns and foreign keys in this PRD (`mcqs` has `question` and `created_by_user_id`, and no `description`) — verified by `migrations/mcq.schema.test.ts` against the SQL files. This machine’s already-applied local D1 still has a stale `description` schema until local state is reset (see Phase 1).
- [x] A question cannot be saved with fewer than 2 or more than 6 choices — MCQ Service and POST `/api/mcqs` tests, 2026-09-02
- [x] A question cannot be saved unless exactly one choice is marked correct — MCQ Service and POST `/api/mcqs` tests, 2026-09-02
- [x] `GET /api/mcqs` returns questions for the table (id, name, question, createdByUserId, timestamps)
- [x] `POST /api/mcqs` creates a question with name, question, createdByUserId, and choices, and returns 201
- [x] `POST /api/mcqs` returns 404 when `createdByUserId` does not match a user
- [x] `PUT /api/mcqs/:id` updates name, question, and choices without changing `createdByUserId`, or 404 / 409 as specified
- [x] `GET /api/mcqs/:id` returns the question with choices ordered by position, or 404
- [x] `DELETE /api/mcqs/:id` removes the question (choices cascade), or 404
- [x] `POST /api/mcq-attempts` records an attempt and sets `isCorrect` from the stored choice, not the client
- [x] `GET /api/mcq-attempts` lists by exactly one of `mcqId` or `userId`
- [x] Route handlers do not run SQL; the MCQ Service is the only D1 access for this feature
- [ ] `/mcq` shows a table (Name, Question, Actions) and a **Create MCQ** button; stub copy is gone
- [ ] **Create MCQ** navigates to a create page with Save and Cancel
- [ ] Create/edit collect **Name** (short label) and **Question** (the prompt); there is no Description field
- [ ] Create form starts with two choices and can add up to six
- [ ] Save on create persists the question and returns the teacher to `/mcq` with the new row visible
- [ ] Cancel on create/edit returns to `/mcq` without saving
- [ ] Actions menu (three vertical dots) offers Edit, Preview, and Delete
- [ ] Edit loads the question into the same form and Save updates it
- [ ] Preview shows the name, the question stem, and choices, and indicates the correct choice; it does not edit or record an attempt
- [ ] Delete asks for confirmation, then removes the row
- [ ] Log out from `/mcq` still calls `POST /api/auth/logout` and returns to `/login`
- [ ] No JWT, cookies, social login, or session store is introduced
- [ ] Each implementation phase wrote tests first (red), then turned them green; failure paths are covered
- [ ] `npm test`, `npm run lint`, and `npm run build` succeed; results are reported, not assumed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Question round-trip | A teacher can create an MCQ and see it in the table without a server error | Manual flow on local preview |
| Choice bounds | 100% of saves with &lt;2, &gt;6, or not-exactly-one-correct rejected | Unit tests + one manual 400 |
| Stub removed | `/mcq` no longer shows “Question CRUD is not available yet” | UI test + visual check |
| Auth regression | Register, login, logout still work | Existing auth tests stay green; logout still on `/mcq` |
| Unit tests | `npm test` exits 0 with no skipped hollow assertions | Vitest run in Phase 5 |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — already bound as `DB` to `quiz-maker` (`eea14e86-b327-4629-a4cc-ab6225e01d39`)
- No new secrets or environment variables

### Internal Dependencies

- `src/lib/db.ts` `getDb()` — D1 access
- `src/lib/services/user-service.ts` — not used for MCQ CRUD HTTP; `users.id` is the FK target for `mcqs.created_by_user_id` and `mcq_attempts.user_id` (existence checks inside MCQ Service)
- Existing auth UI and `POST /api/auth/logout` — list page logout
- Existing shadcn/ui (`table`, `button`, `card`, `field`, `input`, `label`, `dialog`, `badge`)
- shadcn `dropdown-menu` and `textarea` — Phase 4, after approval
- `zod` (^4.5.4) — already installed
- `vitest` and Testing Library — already installed
- Lucide `EllipsisVertical` — already available via `lucide-react`

### Environment

- No new `.dev.vars` entries.
- Keep `.dev.vars` gitignored.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `migrations/0002_create_mcq_tables.sql` already exists empty; a second `wrangler d1 migrations create` would add `0003` and split the schema.
- **Mitigation**: Write into `0002`. Do not create another migration for the initial three tables.
- **Risk**: D1 is unavailable under `npm run dev` (Node), so the table looks empty or fetch 500s during local Node development.
- **Mitigation**: Same as auth: verify with `npm run preview`. Fail with a clear 500 if `env.DB` is missing.
- **Risk**: Create inserts a question, then fails on choices, leaving an orphan `mcqs` row.
- **Mitigation**: Use `db.batch()` (or equivalent atomic multi-statement) in `createMcq` / `updateMcq`.
- **Risk**: Updating choices by delete-all-and-reinsert breaks `mcq_attempts.choice_id` (RESTRICT) or rewrites history.
- **Mitigation**: Stable choice ids; insert/update/delete individually; 409 if a removed choice has attempts.
- **Risk**: Client sends `isCorrect` on an attempt and the API trusts it.
- **Mitigation**: Attempt schema omits `isCorrect`; service snapshots it from `mcq_choices`.
- **Risk**: `createdByUserId` is omitted or forged because there is no session.
- **Mitigation**: Require it on POST, verify the user exists, do not add localStorage. Accept the same trust model as unguarded `/mcq`. Do not invent JWT to fix it in this sprint.
- **Risk**: Tests stay green without proving behavior.
- **Mitigation**: Write tests first and require them to fail. Assert on HTTP status, nested JSON, and accessible UI.
- **Risk**: Unit tests call real D1 or `getCloudflareContext()` and fail under jsdom.
- **Mitigation**: Mock `@/lib/db` in the service; mock the service in routes. Do not add `@cloudflare/vitest-pool-workers`.
- **Risk**: Local `wrangler d1 migrations apply --local` still hits Windows `write EOF` / missing VC++ runtime.
- **Mitigation**: Schema tests read the SQL file. Do not apply `--remote`. Document the same workerd fix as the auth PRD.

### User Experience Risks

- **Risk**: Teachers expect `/mcq` to stay populated after refresh on `npm run dev` (Node) when D1 was never written.
- **Mitigation**: Prefer `npm run preview` for persistence checks. List page shows a fetch error rather than a silent empty table when the API fails.
- **Risk**: Accidental delete from the ellipsis menu.
- **Mitigation**: Confirm with the existing `dialog` before `DELETE`.
- **Risk**: Create form with two empty extra fields feels like a crash if Save is clicked immediately.
- **Mitigation**: Client `FieldError` for empty name, empty question, empty choice bodies, and for “exactly one correct”; disable Save while pending.
- **Risk**: Teachers look for a student “take quiz” on Preview.
- **Mitigation**: Preview copy is inspection-only (correct answer visible). Attempt APIs exist but are not wired to this page.

---

## Troubleshooting Guide

Populate with real incidents as they are fixed. Anticipated issues:

### Empty `0002` migration applied as a no-op

**Problem**: `wrangler d1 migrations apply --local` reports applied but no MCQ tables exist.
**Cause**: `0002` currently has only a comment header.
**Solution**: Put `CREATE TABLE` statements in `0002` **before** apply. If an empty migration was already recorded locally, do not silently apply `--remote`; fix local state with a new local-only migration only if `0002` cannot be edited because it already applied. Prefer filling `0002` before any apply.
**Code Reference**: `migrations/0002_create_mcq_tables.sql`

### Stale local D1 after `0002` was already applied (2026-09-02)

**Problem**: `npx wrangler d1 migrations apply quiz-maker --local` prints `No migrations to apply!` after filling `0002`. `PRAGMA table_info(mcqs)` still has `description` and lacks `question` and `created_by_user_id`.
**Cause**: Wrangler had already recorded `0002` against an older local schema. Editing the same migration file does not re-apply it.
**Solution**: Do **not** add `0003` and do **not** apply `--remote`. After Phase 1 review, reset **local** D1 only (delete `.wrangler/state/v3/d1`) and re-apply `npx wrangler d1 migrations apply quiz-maker --local` so `0001` + filled `0002` run on a clean local database. Schema tests remain the gate for the SQL in git.
**Code Reference**: `migrations/0002_create_mcq_tables.sql:3`

### UNIQUE constraint on `(mcq_id, position)`

**Problem**: Update fails with 500 when reordering choices.
**Cause**: Two rows briefly share a position, or positions are not rewritten 1..n.
**Solution**: Normalize positions in the service before write; update in a batch that ends with unique contiguous positions.

### `first()` returns inconsistent rows

**Problem**: Get-by-id misses a question that exists.
**Cause**: D1 `first()` differs between local and remote.
**Solution**: Use `all()` and read `results[0]`.

### Next.js cannot import `route.ts` from Vitest

**Problem**: Importing `src/app/api/mcqs/route.ts` from a test fails under the Next.js TypeScript plugin.
**Cause**: App Router `route.ts` is reserved as a route module.
**Solution**: Implement handlers in `handler.ts`, re-export from `route.ts`, import `./handler` in `route.test.ts`.

### `getCloudflareContext` throws in tests

**Problem**: MCQ Service or route tests crash under jsdom.
**Cause**: Cloudflare helper or `getDb` is not mocked.
**Solution**: `vi.mock("@/lib/db", ...)`. Never let a unit test reach a real database.

### shadcn add produces no files

**Problem**: `npx shadcn add dropdown-menu` does nothing.
**Cause**: Missing `@shadcn/` namespace on this Base UI setup.
**Solution**: `npx shadcn@latest add @shadcn/dropdown-menu`. If the component does not exist for Base UI, report that and use the fallback noted in UI requirements.

### Dynamic `[id]` page type error

**Problem**: Edit/preview page fails typecheck on `params`.
**Cause**: Next.js 16 passes `params` as a `Promise`.
**Solution**: `const { id } = await params` in the Server Component.

### Auth UI tests fail after removing `McqStub`

**Problem**: `mcq-stub.test.tsx` expects placeholder copy and no Create button.
**Cause**: Phase 4 replaced the stub but left the old test.
**Solution**: Delete or rewrite that file so logout is asserted on the list component instead.

---

## Notes for AI Agents

When working with this PRD:

1. **Stop after each phase unless the user has approved the next one.** Phase 3 is done; do not start Phase 4 until review.
2. Start by reading Overview and Hypothesis: shared teacher test-bank CRUD, not sessions, not AI, not a student quiz runner.
3. Use Scope (In/Out/Cut) as a hard boundary. Do not add JWT, cookies, OAuth, a `description` column, attempt-taking UI, or extra question types. Do persist `question` and `created_by_user_id` as specified.
4. Follow the **TDD** cycle in Testing for Phases 1–4: write the listed tests first, run `npm test` (expect red), then implement until green. Do not implement first and retrofit tests. Phase 5 runs the accumulated suite; if a gap is found, still red then green.
5. Write schema into existing `migrations/0002_create_mcq_tables.sql`. Do not create `0003` for these three tables.
6. Reuse `getDb()`. Do not query D1 from route handlers or client components.
7. Keep the `handler.ts` / `route.ts` split. Tests import `./handler`.
8. Propose shadcn `dropdown-menu` and `textarea` in Phase 4 before adding them. Ask before any new npm package.
9. Preserve logout on `/mcq`. Preserve all auth tests.
10. Update phase status markers as work progresses (`PLANNED` → `IN PROGRESS` → `COMPLETED`).
11. Add concrete `filepath:line-number` references under Technical Implementation Details as code is written.
12. Mark acceptance criteria when they are verified, not when files merely exist.
13. Add troubleshooting entries when bugs are found and fixed.
14. Never deploy. Never apply D1 migrations remotely.
15. Verify with `npm test`, `npm run lint`, and `npm run build` before calling a phase done.
16. After implementation is approved and shipped, update `AGENTS.md` so it no longer describes `/mcq` as a stub.

---

## Current Status

**Last Updated**: 2026-09-02
**Current Phase**: Phase 3 - MCQ and Attempt APIs
**Status**: COMPLETED (awaiting review)
**Next Steps**: Review Phase 3. After approval, begin Phase 4 (UI tests first; propose shadcn `dropdown-menu` and `textarea` before adding them). Do not start Phase 4 before that approval.
