import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqChoiceInUseError, McqNotFoundError } from "@/lib/services/mcq-service";
import { DELETE, GET, PUT } from "./handler";

const { getMcqByIdMock, updateMcqMock, deleteMcqMock } = vi.hoisted(() => ({
	getMcqByIdMock: vi.fn(),
	updateMcqMock: vi.fn(),
	deleteMcqMock: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		getMcqById: getMcqByIdMock,
		updateMcq: updateMcqMock,
		deleteMcq: deleteMcqMock,
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

const context = { params: Promise.resolve({ id: sampleMcq.id }) };

function jsonRequest(method: string, body?: unknown) {
	return new Request(`http://localhost/api/mcqs/${sampleMcq.id}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function readJson(response: Response) {
	return (await response.json()) as {
		error?: string;
		ok?: boolean;
		mcq?: Record<string, unknown>;
	};
}

describe("GET /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with choices", async () => {
		getMcqByIdMock.mockResolvedValue(sampleMcq);

		const response = await GET(jsonRequest("GET"), context);
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body.mcq).toEqual(sampleMcq);
		expect(getMcqByIdMock).toHaveBeenCalledWith(sampleMcq.id);
	});

	it("returns 404 when the service returns null", async () => {
		getMcqByIdMock.mockResolvedValue(null);

		const response = await GET(jsonRequest("GET"), context);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found" });
	});
});

describe("PUT /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and ignores createdByUserId in the body", async () => {
		const updated = { ...sampleMcq, name: "Updated name" };
		updateMcqMock.mockResolvedValue(updated);

		const response = await PUT(
			jsonRequest("PUT", {
				name: "Updated name",
				question: sampleMcq.question,
				createdByUserId: "someone-else",
				choices: [
					{ id: "c1", body: "Water and carbon dioxide", isCorrect: true, position: 1 },
					{ id: "c2", body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
				],
			}),
			context,
		);
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body.mcq).toEqual(updated);
		expect(updateMcqMock).toHaveBeenCalledWith(sampleMcq.id, {
			name: "Updated name",
			question: sampleMcq.question,
			choices: [
				{ id: "c1", body: "Water and carbon dioxide", isCorrect: true, position: 1 },
				{ id: "c2", body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
			],
		});
		expect(updateMcqMock.mock.calls[0]?.[1]).not.toHaveProperty("createdByUserId");
	});

	it("returns 404 when the question is missing", async () => {
		updateMcqMock.mockRejectedValue(new McqNotFoundError("question"));

		const response = await PUT(
			jsonRequest("PUT", {
				name: sampleMcq.name,
				question: sampleMcq.question,
				choices: [
					{ body: "Water and carbon dioxide", isCorrect: true, position: 1 },
					{ body: "Oxygen and nitrogen", isCorrect: false, position: 2 },
				],
			}),
			context,
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found" });
	});

	it("returns 409 when a choice is in use", async () => {
		updateMcqMock.mockRejectedValue(new McqChoiceInUseError());

		const response = await PUT(
			jsonRequest("PUT", {
				name: sampleMcq.name,
				question: sampleMcq.question,
				choices: [
					{ id: "c1", body: "Water and carbon dioxide", isCorrect: true, position: 1 },
					{ body: "Replacement", isCorrect: false, position: 2 },
				],
			}),
			context,
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Cannot remove a choice that has recorded attempts",
		});
	});
});

describe("DELETE /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 { ok: true } when a row is removed", async () => {
		deleteMcqMock.mockResolvedValue(true);

		const response = await DELETE(jsonRequest("DELETE"), context);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(deleteMcqMock).toHaveBeenCalledWith(sampleMcq.id);
	});

	it("returns 404 when the question is missing", async () => {
		deleteMcqMock.mockResolvedValue(false);

		const response = await DELETE(jsonRequest("DELETE"), context);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Question not found" });
	});
});
