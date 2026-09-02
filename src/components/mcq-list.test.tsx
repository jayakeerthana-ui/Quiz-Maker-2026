import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqList } from "@/components/mcq-list";

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

const sampleMcq = {
	id: "q1",
	name: "Photosynthesis",
	question: "What gas do plants produce?",
	createdByUserId: "u1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("McqList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows the MCQ Management heading, Create MCQ, and Log out", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [] }) as Response);

		render(<McqList />);

		expect(screen.getByRole("heading", { name: /mcq management/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /create mcq/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
		await waitFor(() => expect(fetch).toHaveBeenCalled());
	});

	it("navigates to /mcq/new when Create MCQ is clicked", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [] }) as Response);

		render(<McqList />);
		await user.click(screen.getByRole("button", { name: /create mcq/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcq/new");
	});

	it("passes the logged-in user id to Create MCQ so Save can persist", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [] }) as Response);

		render(<McqList createdByUserId="u1" />);
		await user.click(screen.getByRole("button", { name: /create mcq/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcq/new?userId=u1");
	});

	it("renders table headers Name, Question, and Actions", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [] }) as Response);

		render(<McqList />);

		await waitFor(() => {
			expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
		});
		expect(screen.getByRole("columnheader", { name: /question/i })).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: /actions/i })).toBeTruthy();
	});

	it("renders fetched name and question in table rows", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [sampleMcq] }) as Response);

		render(<McqList />);

		await waitFor(() => {
			expect(screen.getByText("Photosynthesis")).toBeTruthy();
		});
		expect(screen.getByText("What gas do plants produce?")).toBeTruthy();
	});

	it("shows empty copy when there are no questions", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [] }) as Response);

		render(<McqList />);

		await waitFor(() => {
			expect(
				screen.getByText(/no questions yet\. create an mcq to start the shared test-bank\./i),
			).toBeTruthy();
		});
		expect(screen.getByRole("button", { name: /create mcq/i })).toBeTruthy();
	});

	it("offers Edit, Preview, and Delete in the Actions menu", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcqs: [sampleMcq] }) as Response);

		render(<McqList />);
		await waitFor(() => screen.getByRole("button", { name: /actions for photosynthesis/i }));
		await user.click(screen.getByRole("button", { name: /actions for photosynthesis/i }));

		expect(await screen.findByRole("menuitem", { name: /edit/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /preview/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /delete/i })).toBeTruthy();
	});

	it("confirms delete then DELETEs the question and removes the row", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs") {
				return jsonResponse(200, { mcqs: [sampleMcq] }) as Response;
			}
			if (method === "DELETE" && url === "/api/mcqs/q1") {
				return jsonResponse(200, { ok: true }) as Response;
			}
			return jsonResponse(500, { error: "unexpected" }) as Response;
		});

		render(<McqList />);
		await waitFor(() => screen.getByText("Photosynthesis"));
		await user.click(screen.getByRole("button", { name: /actions for photosynthesis/i }));
		await user.click(await screen.findByRole("menuitem", { name: /delete/i }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/delete question\?/i)).toBeTruthy();
		expect(within(dialog).getByText("Photosynthesis")).toBeTruthy();
		await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs/q1",
				expect.objectContaining({ method: "DELETE" }),
			);
		});
		await waitFor(() => {
			expect(screen.queryByText("Photosynthesis")).toBeNull();
		});
	});

	it("calls POST /api/auth/logout and navigates to /login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs") {
				return jsonResponse(200, { mcqs: [] }) as Response;
			}
			if (method === "POST" && url === "/api/auth/logout") {
				return jsonResponse(200, { ok: true }) as Response;
			}
			return jsonResponse(500, { error: "unexpected" }) as Response;
		});

		render(<McqList />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/auth/logout",
				expect.objectContaining({ method: "POST" }),
			);
		});
		expect(pushMock).toHaveBeenCalledWith("/login");
	});

	it("navigates to /login even if logout fails", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs") {
				return jsonResponse(200, { mcqs: [] }) as Response;
			}
			if (method === "POST" && url === "/api/auth/logout") {
				throw new Error("network");
			}
			return jsonResponse(500, { error: "unexpected" }) as Response;
		});

		render(<McqList />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
	});
});
