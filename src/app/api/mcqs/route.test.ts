import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError } from "@/lib/services/mcq-service";
import { GET, POST } from "./handler";

const { listMcqsMock, createMcqMock } = vi.hoisted(() => ({
	listMcqsMock: vi.fn(),
	createMcqMock: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		listMcqs: listMcqsMock,
		createMcq: createMcqMock,
	};
});

const sampleMcq = {
	id: "mcq-1",
	name: "Photosynthesis inputs",
	question: "Which inputs are required for photosynthesis?",
	createdByUserId: "user-ada",
	createdAt: "2026-09-02 12:00:00",
	updatedAt: "2026-09-02 12:00:00",
	choices: [
		{ id: "c1", body: "Water and carbon dioxide", isCorrect: true, position: 1 },
		{ id: "c2", body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
	],
};

const validCreateBody = {
	name: sampleMcq.name,
	question: sampleMcq.question,
	createdByUserId: sampleMcq.createdByUserId,
	choices: [
		{ body: "Water and carbon dioxide", isCorrect: true, position: 1 },
		{ body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
	],
};

function jsonRequest(method: string, body?: unknown) {
	return new Request("http://localhost/api/mcqs", {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function readJson(response: Response) {
	return (await response.json()) as {
		error?: string;
		mcqs?: unknown[];
		mcq?: Record<string, unknown>;
	};
}

describe("GET /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with { mcqs }", async () => {
		const summary = {
			id: sampleMcq.id,
			name: sampleMcq.name,
			question: sampleMcq.question,
			createdByUserId: sampleMcq.createdByUserId,
			createdAt: sampleMcq.createdAt,
			updatedAt: sampleMcq.updatedAt,
		};
		listMcqsMock.mockResolvedValue([summary]);

		const response = await GET(jsonRequest("GET"));
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body.mcqs).toEqual([summary]);
		expect(body.mcqs?.[0]).not.toHaveProperty("choices");
	});
});

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with choices and createdByUserId", async () => {
		createMcqMock.mockResolvedValue(sampleMcq);

		const response = await POST(jsonRequest("POST", validCreateBody));
		const body = await readJson(response);

		expect(response.status).toBe(201);
		expect(body.mcq).toMatchObject({
			id: sampleMcq.id,
			name: sampleMcq.name,
			question: sampleMcq.question,
			createdByUserId: "user-ada",
		});
		expect(body.mcq?.choices).toEqual(sampleMcq.choices);
		expect(createMcqMock).toHaveBeenCalledWith(validCreateBody);
	});

	it("returns 400 when name, question, or createdByUserId is missing", async () => {
		const missingName = await POST(jsonRequest("POST", { ...validCreateBody, name: "" }));
		expect(missingName.status).toBe(400);
		expect((await readJson(missingName)).error).toEqual(expect.any(String));

		const missingQuestion = await POST(jsonRequest("POST", { ...validCreateBody, question: "" }));
		expect(missingQuestion.status).toBe(400);

		const missingCreator = await POST(
			jsonRequest("POST", { ...validCreateBody, createdByUserId: "" }),
		);
		expect(missingCreator.status).toBe(400);
		expect(createMcqMock).not.toHaveBeenCalled();
	});

	it("returns 400 when there is only one choice or two correct choices", async () => {
		const oneChoice = await POST(
			jsonRequest("POST", {
				...validCreateBody,
				choices: [{ body: "Only one", isCorrect: true, position: 1 }],
			}),
		);
		expect(oneChoice.status).toBe(400);

		const twoCorrect = await POST(
			jsonRequest("POST", {
				...validCreateBody,
				choices: [
					{ body: "A", isCorrect: true, position: 1 },
					{ body: "B", isCorrect: true, position: 2 },
				],
			}),
		);
		expect(twoCorrect.status).toBe(400);
		expect(createMcqMock).not.toHaveBeenCalled();
	});

	it("returns 404 when the creator user does not exist", async () => {
		createMcqMock.mockRejectedValue(new McqNotFoundError("user"));

		const response = await POST(jsonRequest("POST", validCreateBody));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "User not found" });
	});
});
