import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError } from "@/lib/services/mcq-service";
import { GET, POST } from "./handler";

const { createAttemptMock, listAttemptsByMcqIdMock, listAttemptsByUserIdMock } = vi.hoisted(
	() => ({
		createAttemptMock: vi.fn(),
		listAttemptsByMcqIdMock: vi.fn(),
		listAttemptsByUserIdMock: vi.fn(),
	}),
);

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		createAttempt: createAttemptMock,
		listAttemptsByMcqId: listAttemptsByMcqIdMock,
		listAttemptsByUserId: listAttemptsByUserIdMock,
	};
});

const sampleAttempt = {
	id: "attempt-1",
	mcqId: "mcq-1",
	userId: "user-ada",
	choiceId: "c1",
	isCorrect: true,
	createdAt: "2026-09-02 12:05:00",
};

function jsonRequest(url: string, method: string, body?: unknown) {
	return new Request(url, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function readJson(response: Response) {
	return (await response.json()) as {
		error?: string;
		attempt?: Record<string, unknown>;
		attempts?: unknown[];
	};
}

describe("POST /api/mcq-attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and uses isCorrect from the service, not the request body", async () => {
		createAttemptMock.mockResolvedValue(sampleAttempt);

		const response = await POST(
			jsonRequest("http://localhost/api/mcq-attempts", "POST", {
				mcqId: "mcq-1",
				userId: "user-ada",
				choiceId: "c1",
				isCorrect: false,
			}),
		);
		const body = await readJson(response);

		expect(response.status).toBe(201);
		expect(body.attempt).toEqual(sampleAttempt);
		expect(body.attempt?.isCorrect).toBe(true);
		expect(createAttemptMock).toHaveBeenCalledWith({
			mcqId: "mcq-1",
			userId: "user-ada",
			choiceId: "c1",
		});
		expect(createAttemptMock.mock.calls[0]?.[0]).not.toHaveProperty("isCorrect");
	});

	it("returns 400 when required fields are missing", async () => {
		const response = await POST(
			jsonRequest("http://localhost/api/mcq-attempts", "POST", { mcqId: "mcq-1" }),
		);
		expect(response.status).toBe(400);
		expect((await readJson(response)).error).toEqual(expect.any(String));
		expect(createAttemptMock).not.toHaveBeenCalled();
	});

	it("returns 404 mapped from McqNotFoundError", async () => {
		createAttemptMock.mockRejectedValue(new McqNotFoundError("choice"));

		const response = await POST(
			jsonRequest("http://localhost/api/mcq-attempts", "POST", {
				mcqId: "mcq-1",
				userId: "user-ada",
				choiceId: "missing",
			}),
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Choice not found" });
	});
});

describe("GET /api/mcq-attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with attempts when filtered by mcqId or userId", async () => {
		listAttemptsByMcqIdMock.mockResolvedValue([sampleAttempt]);
		listAttemptsByUserIdMock.mockResolvedValue([sampleAttempt]);

		const byMcq = await GET(
			jsonRequest("http://localhost/api/mcq-attempts?mcqId=mcq-1", "GET"),
		);
		expect(byMcq.status).toBe(200);
		expect(await readJson(byMcq)).toEqual({ attempts: [sampleAttempt] });
		expect(listAttemptsByMcqIdMock).toHaveBeenCalledWith("mcq-1");

		const byUser = await GET(
			jsonRequest("http://localhost/api/mcq-attempts?userId=user-ada", "GET"),
		);
		expect(byUser.status).toBe(200);
		expect(listAttemptsByUserIdMock).toHaveBeenCalledWith("user-ada");
	});

	it("returns 400 when neither or both query params are provided", async () => {
		const neither = await GET(jsonRequest("http://localhost/api/mcq-attempts", "GET"));
		expect(neither.status).toBe(400);
		expect(await neither.json()).toEqual({
			error: "Provide exactly one of mcqId or userId",
		});

		const both = await GET(
			jsonRequest("http://localhost/api/mcq-attempts?mcqId=mcq-1&userId=user-ada", "GET"),
		);
		expect(both.status).toBe(400);
		expect(await both.json()).toEqual({
			error: "Provide exactly one of mcqId or userId",
		});
		expect(listAttemptsByMcqIdMock).not.toHaveBeenCalled();
		expect(listAttemptsByUserIdMock).not.toHaveBeenCalled();
	});
});
