import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	McqChoiceInUseError,
	McqNotFoundError,
	McqValidationError,
	createAttempt,
	createMcq,
	deleteMcq,
	getAttemptById,
	getMcqById,
	listAttemptsByMcqId,
	listAttemptsByUserId,
	listMcqs,
	updateMcq,
} from "@/lib/services/mcq-service";

type UserRow = { id: string };
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

const USER_ID = "user-ada";
const OTHER_USER_ID = "user-grace";
const getDb = vi.fn();

vi.mock("@/lib/db", () => ({
	getDb: () => getDb(),
}));

function createFakeD1() {
	const users: UserRow[] = [{ id: USER_ID }, { id: OTHER_USER_ID }];
	const mcqs: McqRow[] = [];
	const choices: ChoiceRow[] = [];
	const attempts: AttemptRow[] = [];
	let nextId = 1;
	let tick = 0;

	function now() {
		tick += 1;
		return `2026-09-02 12:00:${String(tick).padStart(2, "0")}`;
	}

	function newId() {
		return `row-${nextId++}`;
	}

	function execute(sql: string, params: unknown[]) {
		const normalized = sql.replace(/\s+/g, " ").trim();

		if (/select id from users where id = \?1/i.test(normalized)) {
			const id = String(params[0]);
			return { results: users.filter((user) => user.id === id) };
		}

		if (/insert into mcqs/i.test(normalized)) {
			const [id, name, question, createdByUserId] = params as string[];
			const timestamp = now();
			const row: McqRow = {
				id: id || newId(),
				name,
				question,
				created_by_user_id: createdByUserId,
				created_at: timestamp,
				updated_at: timestamp,
			};
			mcqs.push(row);
			return { results: [row] };
		}

		if (/insert into mcq_choices/i.test(normalized)) {
			const [id, mcqId, body, isCorrect, position] = params as [
				string,
				string,
				string,
				number,
				number,
			];
			const timestamp = now();
			const row: ChoiceRow = {
				id: id || newId(),
				mcq_id: mcqId,
				body,
				is_correct: Number(isCorrect),
				position: Number(position),
				created_at: timestamp,
				updated_at: timestamp,
			};
			choices.push(row);
			return { results: [row] };
		}

		if (/insert into mcq_attempts/i.test(normalized)) {
			const [id, mcqId, userId, choiceId, isCorrect] = params as [
				string,
				string,
				string,
				string,
				number,
			];
			const row: AttemptRow = {
				id: id || newId(),
				mcq_id: mcqId,
				user_id: userId,
				choice_id: choiceId,
				is_correct: Number(isCorrect),
				created_at: now(),
			};
			attempts.push(row);
			return { results: [row] };
		}

		if (/update mcqs set/i.test(normalized)) {
			const id = String(params.at(-1));
			const row = mcqs.find((item) => item.id === id);
			if (!row) return { results: [] };
			row.name = String(params[0]);
			row.question = String(params[1]);
			row.updated_at = now();
			return { results: [row] };
		}

		if (/update mcq_choices set/i.test(normalized)) {
			const id = String(params[3]);
			const mcqId = String(params[4]);
			const row = choices.find((item) => item.id === id && item.mcq_id === mcqId);
			if (!row) return { results: [] };
			row.body = String(params[0]);
			row.is_correct = Number(params[1]);
			row.position = Number(params[2]);
			row.updated_at = now();
			return { results: [row] };
		}

		if (/delete from mcq_choices where id = \?1 and mcq_id = \?2/i.test(normalized)) {
			const id = String(params[0]);
			const mcqId = String(params[1]);
			const index = choices.findIndex((item) => item.id === id && item.mcq_id === mcqId);
			if (index === -1) return { results: [] };
			const [removed] = choices.splice(index, 1);
			return { results: [removed] };
		}

		if (/delete from mcqs where id = \?1/i.test(normalized)) {
			const id = String(params[0]);
			const index = mcqs.findIndex((item) => item.id === id);
			if (index === -1) return { results: [] };
			const [removed] = mcqs.splice(index, 1);
			for (let i = choices.length - 1; i >= 0; i -= 1) {
				if (choices[i]?.mcq_id === id) choices.splice(i, 1);
			}
			for (let i = attempts.length - 1; i >= 0; i -= 1) {
				if (attempts[i]?.mcq_id === id) attempts.splice(i, 1);
			}
			return { results: [removed] };
		}

		if (/from mcq_attempts where choice_id = \?1/i.test(normalized)) {
			const choiceId = String(params[0]);
			return { results: attempts.filter((item) => item.choice_id === choiceId) };
		}

		if (/from mcq_attempts where mcq_id = \?1/i.test(normalized)) {
			const mcqId = String(params[0]);
			const results = attempts
				.filter((item) => item.mcq_id === mcqId)
				.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
			return { results };
		}

		if (/from mcq_attempts where user_id = \?1/i.test(normalized)) {
			const userId = String(params[0]);
			const results = attempts
				.filter((item) => item.user_id === userId)
				.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
			return { results };
		}

		if (/from mcq_attempts where id = \?1/i.test(normalized)) {
			return { results: attempts.filter((item) => item.id === String(params[0])) };
		}

		if (/from mcq_choices where mcq_id = \?1/i.test(normalized)) {
			const results = choices
				.filter((item) => item.mcq_id === String(params[0]))
				.sort((a, b) => a.position - b.position);
			return { results };
		}

		if (/from mcq_choices where id = \?1/i.test(normalized)) {
			return { results: choices.filter((item) => item.id === String(params[0])) };
		}

		if (/from mcqs where id = \?1/i.test(normalized)) {
			return { results: mcqs.filter((item) => item.id === String(params[0])) };
		}

		if (/from mcqs/i.test(normalized) && /order by created_at desc/i.test(normalized)) {
			const results = [...mcqs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
			return { results };
		}

		throw new Error(`Unhandled SQL in fake D1: ${normalized}`);
	}

	function statement(sql: string, params: unknown[] = []) {
		return {
			bind(...next: unknown[]) {
				return statement(sql, next);
			},
			async all() {
				return execute(sql, params);
			},
		};
	}

	return {
		prepare(sql: string) {
			return statement(sql);
		},
		async batch(statements: Array<{ all: () => Promise<{ results: unknown[] }> }>) {
			const results = [];
			for (const stmt of statements) {
				results.push(await stmt.all());
			}
			return results;
		},
	};
}

function validChoices() {
	return [
		{ body: "Water and carbon dioxide", isCorrect: true, position: 1 },
		{ body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
	];
}

async function seedMcq(
	overrides: Partial<{
		name: string;
		question: string;
		createdByUserId: string;
		choices: ReturnType<typeof validChoices>;
	}> = {},
) {
	return createMcq({
		name: overrides.name ?? "Photosynthesis inputs",
		question: overrides.question ?? "Which inputs are required for photosynthesis?",
		createdByUserId: overrides.createdByUserId ?? USER_ID,
		choices: overrides.choices ?? validChoices(),
	});
}

describe("mcq service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDb.mockResolvedValue(createFakeD1());
	});

	it("createMcq persists name, question, createdByUserId, and choices as camelCase booleans", async () => {
		const mcq = await seedMcq();

		expect(mcq.name).toBe("Photosynthesis inputs");
		expect(mcq.question).toBe("Which inputs are required for photosynthesis?");
		expect(mcq.createdByUserId).toBe(USER_ID);
		expect(mcq.choices).toHaveLength(2);
		expect(mcq.choices[0]).toMatchObject({
			body: "Water and carbon dioxide",
			isCorrect: true,
			position: 1,
		});
		expect(mcq.choices[0]?.isCorrect).not.toBe(1);
		expect(mcq).not.toHaveProperty("created_by_user_id");
		expect(mcq.choices[0]).not.toHaveProperty("is_correct");
	});

	it("createMcq rejects an unknown createdByUserId", async () => {
		await expect(seedMcq({ createdByUserId: "missing-user" })).rejects.toMatchObject({
			name: "McqNotFoundError",
			message: "User not found",
		});
		await expect(seedMcq({ createdByUserId: "missing-user" })).rejects.toBeInstanceOf(
			McqNotFoundError,
		);
	});

	it("createMcq rejects fewer than 2 choices, more than 6, zero correct, two correct, and bad positions", async () => {
		await expect(
			seedMcq({
				choices: [{ body: "Only one", isCorrect: true, position: 1 }],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			seedMcq({
				choices: [
					...validChoices(),
					{ body: "C", isCorrect: false, position: 3 },
					{ body: "D", isCorrect: false, position: 4 },
					{ body: "E", isCorrect: false, position: 5 },
					{ body: "F", isCorrect: false, position: 6 },
					{ body: "G", isCorrect: false, position: 7 },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			seedMcq({
				choices: [
					{ body: "A", isCorrect: false, position: 1 },
					{ body: "B", isCorrect: false, position: 2 },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			seedMcq({
				choices: [
					{ body: "A", isCorrect: true, position: 1 },
					{ body: "B", isCorrect: true, position: 2 },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			seedMcq({
				choices: [
					{ body: "A", isCorrect: true, position: 1 },
					{ body: "B", isCorrect: false, position: 1 },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);

		await expect(
			seedMcq({
				choices: [
					{ body: "A", isCorrect: true, position: 1 },
					{ body: "B", isCorrect: false, position: 3 },
				],
			}),
		).rejects.toBeInstanceOf(McqValidationError);
	});

	it("listMcqs returns questions without choice rows, including question and createdByUserId", async () => {
		const first = await seedMcq({ name: "First" });
		const second = await seedMcq({ name: "Second", question: "Second stem" });

		const listed = await listMcqs();
		expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
		expect(listed[0]).toMatchObject({
			name: "Second",
			question: "Second stem",
			createdByUserId: USER_ID,
		});
		expect(listed[0]).not.toHaveProperty("choices");
	});

	it("getMcqById returns choices ordered by position, or null", async () => {
		const created = await seedMcq({
			choices: [
				{ body: "Second", isCorrect: false, position: 2 },
				{ body: "First", isCorrect: true, position: 1 },
			],
		});

		const loaded = await getMcqById(created.id);
		expect(loaded?.choices.map((choice) => choice.body)).toEqual(["First", "Second"]);
		expect(await getMcqById("missing")).toBeNull();
	});

	it("updateMcq changes name and question, mutates choices, and does not change createdByUserId", async () => {
		const created = await seedMcq();
		const keepId = created.choices[0]?.id;
		const dropId = created.choices[1]?.id;
		expect(keepId).toBeDefined();
		expect(dropId).toBeDefined();

		const updated = await updateMcq(created.id, {
			name: "Updated name",
			question: "Updated stem?",
			choices: [
				{ id: keepId, body: "Updated correct", isCorrect: true, position: 1 },
				{ body: "Brand new", isCorrect: false, position: 2 },
			],
		});

		expect(updated.createdByUserId).toBe(USER_ID);
		expect(updated.name).toBe("Updated name");
		expect(updated.question).toBe("Updated stem?");
		expect(updated.choices).toHaveLength(2);
		expect(updated.choices.find((choice) => choice.id === keepId)?.body).toBe("Updated correct");
		expect(updated.choices.some((choice) => choice.id === dropId)).toBe(false);
		expect(updated.choices.some((choice) => choice.body === "Brand new")).toBe(true);

		const reloaded = await getMcqById(created.id);
		expect(reloaded?.createdByUserId).toBe(USER_ID);
	});

	it("updateMcq throws McqChoiceInUseError when removing a choice that has attempts", async () => {
		const created = await seedMcq();
		const keep = created.choices[0];
		const inUse = created.choices[1];
		expect(keep?.id).toBeDefined();
		expect(inUse?.id).toBeDefined();

		await createAttempt({
			mcqId: created.id,
			userId: USER_ID,
			choiceId: inUse!.id,
		});

		await expect(
			updateMcq(created.id, {
				name: created.name,
				question: created.question,
				choices: [
					{ id: keep!.id, body: keep!.body, isCorrect: true, position: 1 },
					{ body: "Replacement", isCorrect: false, position: 2 },
				],
			}),
		).rejects.toBeInstanceOf(McqChoiceInUseError);
	});

	it("deleteMcq removes the question and associated choices", async () => {
		const created = await seedMcq();

		expect(await deleteMcq(created.id)).toBe(true);
		expect(await getMcqById(created.id)).toBeNull();
		expect(await deleteMcq(created.id)).toBe(false);
	});

	it("createAttempt stores isCorrect from the stored choice, not from the caller", async () => {
		const created = await seedMcq();
		const correct = created.choices.find((choice) => choice.isCorrect);
		const incorrect = created.choices.find((choice) => !choice.isCorrect);
		expect(correct?.id).toBeDefined();
		expect(incorrect?.id).toBeDefined();

		const right = await createAttempt({
			mcqId: created.id,
			userId: USER_ID,
			choiceId: correct!.id,
		});
		expect(right.isCorrect).toBe(true);
		expect(right.isCorrect).not.toBe(1);

		const wrong = await createAttempt({
			mcqId: created.id,
			userId: USER_ID,
			choiceId: incorrect!.id,
		});
		expect(wrong.isCorrect).toBe(false);
	});

	it("createAttempt rejects unknown user, unknown question, or a choice from another question", async () => {
		const first = await seedMcq({ name: "One" });
		const second = await seedMcq({ name: "Two" });
		const foreignChoice = second.choices[0];
		expect(foreignChoice?.id).toBeDefined();

		await expect(
			createAttempt({ mcqId: first.id, userId: "missing-user", choiceId: first.choices[0]!.id }),
		).rejects.toMatchObject({ name: "McqNotFoundError", message: "User not found" });

		await expect(
			createAttempt({
				mcqId: "missing-mcq",
				userId: USER_ID,
				choiceId: first.choices[0]!.id,
			}),
		).rejects.toMatchObject({ name: "McqNotFoundError", message: "Question not found" });

		await expect(
			createAttempt({
				mcqId: first.id,
				userId: USER_ID,
				choiceId: foreignChoice!.id,
			}),
		).rejects.toMatchObject({ name: "McqNotFoundError", message: "Choice not found" });
	});

	it("listAttemptsByMcqId, listAttemptsByUserId, and getAttemptById cover hit and miss", async () => {
		const created = await seedMcq();
		const choiceId = created.choices[0]!.id;

		const first = await createAttempt({
			mcqId: created.id,
			userId: USER_ID,
			choiceId,
		});
		const second = await createAttempt({
			mcqId: created.id,
			userId: OTHER_USER_ID,
			choiceId,
		});

		expect((await listAttemptsByMcqId(created.id)).map((item) => item.id)).toEqual([
			second.id,
			first.id,
		]);
		expect((await listAttemptsByUserId(USER_ID)).map((item) => item.id)).toEqual([first.id]);
		expect(await getAttemptById(first.id)).toMatchObject({
			id: first.id,
			mcqId: created.id,
			userId: USER_ID,
			choiceId,
		});
		expect(await getAttemptById("missing")).toBeNull();
		expect(await listAttemptsByMcqId("missing")).toEqual([]);
		expect(await listAttemptsByUserId("missing")).toEqual([]);
	});
});
