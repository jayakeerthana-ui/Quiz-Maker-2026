import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqPreview } from "@/components/mcq-preview";

const { pushMock } = vi.hoisted(() => ({
	pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: pushMock }),
}));

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

const loadedMcq = {
	id: "q1",
	name: "Photosynthesis",
	question: "What gas do plants produce?",
	createdByUserId: "u1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	choices: [
		{ id: "c1", body: "Oxygen", isCorrect: true, position: 1 },
		{ id: "c2", body: "Nitrogen", isCorrect: false, position: 2 },
	],
};

describe("McqPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows the name, question stem, choices, and the correct badge", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Photosynthesis" })).toBeTruthy();
		});
		expect(screen.getByText("What gas do plants produce?")).toBeTruthy();
		expect(screen.getByText("Oxygen")).toBeTruthy();
		expect(screen.getByText("Nitrogen")).toBeTruthy();
		expect(screen.getByText(/^correct$/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
		expect(fetch).toHaveBeenCalledWith("/api/mcqs/q1");
	});
});
