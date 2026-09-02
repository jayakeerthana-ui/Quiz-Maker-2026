import { getDb } from "@/lib/db";

export type McqNotFoundEntity = "question" | "choice" | "user" | "attempt";

export class McqNotFoundError extends Error {
	readonly entity: McqNotFoundEntity;

	constructor(entity: McqNotFoundEntity) {
		const messages: Record<McqNotFoundEntity, string> = {
			question: "Question not found",
			choice: "Choice not found",
			user: "User not found",
			attempt: "Attempt not found",
		};
		super(messages[entity]);
		this.name = "McqNotFoundError";
		this.entity = entity;
	}
}

export class McqValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McqValidationError";
	}
}

export class McqChoiceInUseError extends Error {
	constructor() {
		super("Cannot remove a choice that has recorded attempts");
		this.name = "McqChoiceInUseError";
	}
}

export type McqChoiceInput = {
	id?: string;
	body: string;
	isCorrect: boolean;
	position: number;
};

export type PublicChoice = {
	id: string;
	body: string;
	isCorrect: boolean;
	position: number;
};

export type PublicMcq = {
	id: string;
	name: string;
	question: string;
	createdByUserId: string;
	createdAt: string;
	updatedAt: string;
	choices: PublicChoice[];
};

export type PublicMcqSummary = Omit<PublicMcq, "choices">;

export type PublicAttempt = {
	id: string;
	mcqId: string;
	userId: string;
	choiceId: string;
	isCorrect: boolean;
	createdAt: string;
};

export type CreateMcqInput = {
	name: string;
	question: string;
	createdByUserId: string;
	choices: McqChoiceInput[];
};

export type UpdateMcqInput = {
	name: string;
	question: string;
	choices: McqChoiceInput[];
};

export type CreateAttemptInput = {
	mcqId: string;
	userId: string;
	choiceId: string;
};

type McqRow = {
	id: string;
	name: string;
	question: string;
	created_by_user_id: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	body: string;
	is_correct: number;
	position: number;
	created_at: string;
	updated_at: string;
};

type AttemptRow = {
	id: string;
	mcq_id: string;
	user_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
};

const MCQ_COLUMNS = "id, name, question, created_by_user_id, created_at, updated_at";
const CHOICE_COLUMNS = "id, mcq_id, body, is_correct, position, created_at, updated_at";
const ATTEMPT_COLUMNS = "id, mcq_id, user_id, choice_id, is_correct, created_at";

function newId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toPublicChoice(row: ChoiceRow): PublicChoice {
	return {
		id: row.id,
		body: row.body,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

export function toPublicMcq(row: McqRow, choices: ChoiceRow[]): PublicMcq {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		choices: choices.map(toPublicChoice),
	};
}

export function toPublicMcqSummary(row: McqRow): PublicMcqSummary {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function toPublicAttempt(row: AttemptRow): PublicAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		userId: row.user_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

function assertChoices(choices: McqChoiceInput[]): void {
	if (choices.length < 2 || choices.length > 6) {
		throw new McqValidationError("A question must have between 2 and 6 choices");
	}

	const correctCount = choices.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new McqValidationError("Exactly one choice must be marked correct");
	}

	const positions = choices.map((choice) => choice.position).sort((a, b) => a - b);
	const expected = choices.map((_, index) => index + 1);
	if (positions.some((position, index) => position !== expected[index])) {
		throw new McqValidationError("Choice positions must be unique and contiguous starting at 1");
	}
}

async function firstRow<T>(sql: string, ...params: unknown[]): Promise<T | null> {
	const db = await getDb();
	const { results } = await db.prepare(sql).bind(...params).all<T>();
	return results[0] ?? null;
}

async function allRows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
	const db = await getDb();
	const { results } = await db.prepare(sql).bind(...params).all<T>();
	return results;
}

async function requireUser(userId: string): Promise<void> {
	const row = await firstRow<{ id: string }>("SELECT id FROM users WHERE id = ?1", userId);
	if (!row) {
		throw new McqNotFoundError("user");
	}
}

async function loadChoices(mcqId: string): Promise<ChoiceRow[]> {
	return allRows<ChoiceRow>(
		`SELECT ${CHOICE_COLUMNS} FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC`,
		mcqId,
	);
}

async function choiceHasAttempts(choiceId: string): Promise<boolean> {
	const row = await firstRow<{ id: string }>(
		"SELECT id FROM mcq_attempts WHERE choice_id = ?1",
		choiceId,
	);
	return Boolean(row);
}

export async function listMcqs(): Promise<PublicMcqSummary[]> {
	const rows = await allRows<McqRow>(
		`SELECT ${MCQ_COLUMNS} FROM mcqs ORDER BY created_at DESC`,
	);
	return rows.map(toPublicMcqSummary);
}

export async function getMcqById(id: string): Promise<PublicMcq | null> {
	const row = await firstRow<McqRow>(`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1`, id);
	if (!row) {
		return null;
	}
	const choices = await loadChoices(id);
	return toPublicMcq(row, choices);
}

export async function createMcq(input: CreateMcqInput): Promise<PublicMcq> {
	const name = input.name.trim();
	const question = input.question.trim();
	const createdByUserId = input.createdByUserId.trim();
	const choices = input.choices.map((choice) => ({
		...choice,
		body: choice.body.trim(),
	}));

	await requireUser(createdByUserId);
	assertChoices(choices);

	const mcqId = newId();
	const db = await getDb();
	await db.batch([
		db
			.prepare(
				`INSERT INTO mcqs (id, name, question, created_by_user_id)
VALUES (?1, ?2, ?3, ?4)
RETURNING ${MCQ_COLUMNS}`,
			)
			.bind(mcqId, name, question, createdByUserId),
		...choices.map((choice) =>
			db
				.prepare(
					`INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position)
VALUES (?1, ?2, ?3, ?4, ?5)
RETURNING ${CHOICE_COLUMNS}`,
				)
				.bind(newId(), mcqId, choice.body, choice.isCorrect ? 1 : 0, choice.position),
		),
	]);

	const created = await getMcqById(mcqId);
	if (!created) {
		throw new Error("Failed to create question");
	}
	return created;
}

export async function updateMcq(id: string, input: UpdateMcqInput): Promise<PublicMcq> {
	const existing = await getMcqById(id);
	if (!existing) {
		throw new McqNotFoundError("question");
	}

	const name = input.name.trim();
	const question = input.question.trim();
	const choices = input.choices.map((choice) => ({
		...choice,
		id: choice.id?.trim(),
		body: choice.body.trim(),
	}));
	assertChoices(choices);

	const incomingIds = new Set(
		choices.map((choice) => choice.id).filter((choiceId): choiceId is string => Boolean(choiceId)),
	);

	for (const current of existing.choices) {
		if (!incomingIds.has(current.id) && (await choiceHasAttempts(current.id))) {
			throw new McqChoiceInUseError();
		}
	}

	const db = await getDb();
	const statements = [
		db
			.prepare(
				`UPDATE mcqs SET name = ?1, question = ?2, updated_at = datetime('now') WHERE id = ?3 RETURNING ${MCQ_COLUMNS}`,
			)
			.bind(name, question, id),
	];

	for (const current of existing.choices) {
		if (!incomingIds.has(current.id)) {
			statements.push(
				db
					.prepare("DELETE FROM mcq_choices WHERE id = ?1 AND mcq_id = ?2")
					.bind(current.id, id),
			);
		}
	}

	for (const choice of choices) {
		if (choice.id) {
			const belongs = existing.choices.some((current) => current.id === choice.id);
			if (!belongs) {
				throw new McqNotFoundError("choice");
			}
			statements.push(
				db
					.prepare(
						`UPDATE mcq_choices SET body = ?1, is_correct = ?2, position = ?3, updated_at = datetime('now')
WHERE id = ?4 AND mcq_id = ?5
RETURNING ${CHOICE_COLUMNS}`,
					)
					.bind(choice.body, choice.isCorrect ? 1 : 0, choice.position, choice.id, id),
			);
		} else {
			statements.push(
				db
					.prepare(
						`INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position)
VALUES (?1, ?2, ?3, ?4, ?5)
RETURNING ${CHOICE_COLUMNS}`,
					)
					.bind(newId(), id, choice.body, choice.isCorrect ? 1 : 0, choice.position),
			);
		}
	}

	await db.batch(statements);

	const updated = await getMcqById(id);
	if (!updated) {
		throw new McqNotFoundError("question");
	}
	return updated;
}

export async function deleteMcq(id: string): Promise<boolean> {
	const db = await getDb();
	const { results } = await db
		.prepare("DELETE FROM mcqs WHERE id = ?1 RETURNING id")
		.bind(id)
		.all<{ id: string }>();
	return results.length > 0;
}

export async function createAttempt(input: CreateAttemptInput): Promise<PublicAttempt> {
	await requireUser(input.userId);

	const mcq = await firstRow<McqRow>(
		`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1`,
		input.mcqId,
	);
	if (!mcq) {
		throw new McqNotFoundError("question");
	}

	const choice = await firstRow<ChoiceRow>(
		`SELECT ${CHOICE_COLUMNS} FROM mcq_choices WHERE id = ?1`,
		input.choiceId,
	);
	if (!choice || choice.mcq_id !== input.mcqId) {
		throw new McqNotFoundError("choice");
	}

	const id = newId();
	const db = await getDb();
	const { results } = await db
		.prepare(
			`INSERT INTO mcq_attempts (id, mcq_id, user_id, choice_id, is_correct)
VALUES (?1, ?2, ?3, ?4, ?5)
RETURNING ${ATTEMPT_COLUMNS}`,
		)
		.bind(id, input.mcqId, input.userId, input.choiceId, choice.is_correct)
		.all<AttemptRow>();
	const row = results[0];
	if (!row) {
		throw new Error("Failed to record attempt");
	}
	return toPublicAttempt(row);
}

export async function listAttemptsByMcqId(mcqId: string): Promise<PublicAttempt[]> {
	const rows = await allRows<AttemptRow>(
		`SELECT ${ATTEMPT_COLUMNS} FROM mcq_attempts WHERE mcq_id = ?1 ORDER BY created_at DESC`,
		mcqId,
	);
	return rows.map(toPublicAttempt);
}

export async function listAttemptsByUserId(userId: string): Promise<PublicAttempt[]> {
	const rows = await allRows<AttemptRow>(
		`SELECT ${ATTEMPT_COLUMNS} FROM mcq_attempts WHERE user_id = ?1 ORDER BY created_at DESC`,
		userId,
	);
	return rows.map(toPublicAttempt);
}

export async function getAttemptById(id: string): Promise<PublicAttempt | null> {
	const row = await firstRow<AttemptRow>(
		`SELECT ${ATTEMPT_COLUMNS} FROM mcq_attempts WHERE id = ?1`,
		id,
	);
	return row ? toPublicAttempt(row) : null;
}
