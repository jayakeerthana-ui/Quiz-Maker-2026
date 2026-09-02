import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./handler";

const { getAttemptByIdMock } = vi.hoisted(() => ({
	getAttemptByIdMock: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		getAttemptById: getAttemptByIdMock,
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

const context = { params: Promise.resolve({ id: sampleAttempt.id }) };

describe("GET /api/mcq-attempts/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with the attempt", async () => {
		getAttemptByIdMock.mockResolvedValue(sampleAttempt);

		const response = await GET(
			new Request("http://localhost/api/mcq-attempts/attempt-1", { method: "GET" }),
			context,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ attempt: sampleAttempt });
		expect(getAttemptByIdMock).toHaveBeenCalledWith("attempt-1");
	});

	it("returns 404 when the attempt is missing", async () => {
		getAttemptByIdMock.mockResolvedValue(null);

		const response = await GET(
			new Request("http://localhost/api/mcq-attempts/missing", { method: "GET" }),
			context,
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Attempt not found" });
	});
});
