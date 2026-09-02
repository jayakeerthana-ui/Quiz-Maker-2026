import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

	it("shows the name, question stem, and choices without revealing the correct answer", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Photosynthesis" })).toBeTruthy();
		});
		expect(screen.getByText("What gas do plants produce?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: /oxygen/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /nitrogen/i })).toBeTruthy();
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
		expect(fetch).toHaveBeenCalledWith("/api/mcqs/q1");
	});

	it("asks to select an answer before checking", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);
		await waitFor(() => screen.getByRole("button", { name: /check answer/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/select an answer/i);
		expect(screen.queryByText(/^correct$/i)).toBeNull();
	});

	it("marks a correct selection as Correct after Check answer", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);
		await waitFor(() => screen.getByRole("radio", { name: /oxygen/i }));
		await user.click(screen.getByRole("radio", { name: /oxygen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/^correct$/i);
		expect(fetch).not.toHaveBeenCalledWith(
			expect.stringContaining("/api/mcq-attempts"),
			expect.anything(),
		);
	});

	it("marks a wrong selection as Incorrect and then shows the correct choice", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);
		await waitFor(() => screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/^incorrect$/i);
		expect(screen.getByText(/^correct$/i)).toBeTruthy();
	});
});
