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

function mockPreviewFetch(
	existingAttempts: { id: string; mcqId: string; isCorrect: boolean }[] = [],
) {
	vi.mocked(fetch).mockImplementation(async (input, init) => {
		const url = String(input);
		const method = (init as RequestInit | undefined)?.method ?? "GET";

		if (url === "/api/mcqs/q1") {
			return jsonResponse(200, { mcq: loadedMcq }) as Response;
		}

		if (url === "/api/mcq-attempts?userId=u1" && method === "GET") {
			return jsonResponse(200, {
				attempts: existingAttempts.map((attempt) => ({
					...attempt,
					userId: "u1",
					choiceId: attempt.isCorrect ? "c1" : "c2",
					createdAt: "2026-01-01T00:00:00.000Z",
				})),
			}) as Response;
		}

		if (url === "/api/mcq-attempts" && method === "POST") {
			const body = JSON.parse(String((init as RequestInit).body)) as {
				mcqId: string;
				userId: string;
				choiceId: string;
			};
			return jsonResponse(201, {
				attempt: {
					id: "a-new",
					mcqId: body.mcqId,
					userId: body.userId,
					choiceId: body.choiceId,
					isCorrect: body.choiceId === "c1",
					createdAt: "2026-01-01T00:00:00.000Z",
				},
			}) as Response;
		}

		return jsonResponse(404, { error: "not found" }) as Response;
	});
}

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
		mockPreviewFetch();

		render(<McqPreview mcqId="q1" createdByUserId="u1" />);
		await waitFor(() => screen.getByRole("button", { name: /check answer/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/select an answer/i);
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(
			vi.mocked(fetch).mock.calls.some(([url, init]) => {
				return url === "/api/mcq-attempts" && (init as RequestInit | undefined)?.method === "POST";
			}),
		).toBe(false);
	});

	it("does not POST an attempt when the user id is missing", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqPreview mcqId="q1" />);
		await waitFor(() => screen.getByRole("radio", { name: /oxygen/i }));
		await user.click(screen.getByRole("radio", { name: /oxygen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/user is required/i);
		expect(
			vi.mocked(fetch).mock.calls.some(([url, init]) => {
				return url === "/api/mcq-attempts" && (init as RequestInit | undefined)?.method === "POST";
			}),
		).toBe(false);
	});

	it("records a wrong selection as Incorrect without revealing the correct choice", async () => {
		const user = userEvent.setup();
		mockPreviewFetch();

		render(<McqPreview mcqId="q1" createdByUserId="u1" />);
		await waitFor(() => screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toMatch(/^incorrect$/i);
		});
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.getByText(/attempts:\s*1/i)).toBeTruthy();

		const postCall = vi.mocked(fetch).mock.calls.find(([url, init]) => {
			return url === "/api/mcq-attempts" && (init as RequestInit | undefined)?.method === "POST";
		});
		expect(postCall).toBeTruthy();
		const body = JSON.parse(String((postCall?.[1] as RequestInit).body)) as {
			mcqId: string;
			userId: string;
			choiceId: string;
		};
		expect(body).toEqual({ mcqId: "q1", userId: "u1", choiceId: "c2" });
		expect(body).not.toHaveProperty("isCorrect");
	});

	it("records each check and shows how many attempts it took to answer correctly", async () => {
		const user = userEvent.setup();
		mockPreviewFetch();

		render(<McqPreview mcqId="q1" createdByUserId="u1" />);
		await waitFor(() => screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("radio", { name: /nitrogen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));
		await waitFor(() => {
			expect(screen.getByText(/attempts:\s*1/i)).toBeTruthy();
		});

		await user.click(screen.getByRole("radio", { name: /oxygen/i }));
		await user.click(screen.getByRole("button", { name: /check answer/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toMatch(/^correct$/i);
		});
		expect(screen.getByText(/attempts:\s*2/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /check answer/i })).toBeNull();
	});
});
