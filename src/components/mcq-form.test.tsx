import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqForm } from "@/components/mcq-form";

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

async function fillCreateForm(
	user: ReturnType<typeof userEvent.setup>,
	overrides?: { name?: string; question?: string },
) {
	await user.type(screen.getByLabelText(/^name$/i), overrides?.name ?? "Photosynthesis");
	await user.type(
		screen.getByLabelText(/^question$/i),
		overrides?.question ?? "What gas do plants produce?",
	);
	await user.type(screen.getByLabelText(/^choice 1$/i), "Oxygen");
	await user.type(screen.getByLabelText(/^choice 2$/i), "Nitrogen");
}

describe("McqForm create", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("requires Name and Question and does not POST when they are empty", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" createdByUserId="u1" />);

		await user.click(screen.getByRole("button", { name: /save/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/name is required/i);
		expect(fetch).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("starts with two choice rows", () => {
		render(<McqForm mode="create" createdByUserId="u1" />);

		expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
	});

	it("adds choices until 6 and cannot remove below 2", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" createdByUserId="u1" />);

		const add = screen.getByRole("button", { name: /add choice/i });
		for (let i = 0; i < 4; i += 1) {
			await user.click(add);
		}

		expect(screen.getByLabelText(/^choice 6$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^choice 7$/i)).toBeNull();
		expect(add).toHaveProperty("disabled", true);

		await user.click(screen.getByRole("button", { name: /remove choice 6/i }));
		expect(screen.queryByLabelText(/^choice 6$/i)).toBeNull();
		expect(screen.getByLabelText(/^choice 5$/i)).toBeTruthy();

		await user.click(screen.getByRole("button", { name: /remove choice 5/i }));
		await user.click(screen.getByRole("button", { name: /remove choice 4/i }));
		await user.click(screen.getByRole("button", { name: /remove choice 3/i }));

		expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
	});

	it("POSTs /api/mcqs with createdByUserId and navigates to /mcq on 201", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(201, { mcq: { ...loadedMcq } }) as Response,
		);

		render(<McqForm mode="create" createdByUserId="u1" />);
		await fillCreateForm(user);
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => expect(fetch).toHaveBeenCalled());

		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as {
			name: string;
			question: string;
			createdByUserId: string;
			choices: { body: string; isCorrect: boolean; position: number }[];
		};

		expect(url).toBe("/api/mcqs");
		expect(init.method).toBe("POST");
		expect(body.name).toBe("Photosynthesis");
		expect(body.question).toBe("What gas do plants produce?");
		expect(body.createdByUserId).toBe("u1");
		expect(body.choices).toEqual([
			{ body: "Oxygen", isCorrect: true, position: 1 },
			{ body: "Nitrogen", isCorrect: false, position: 2 },
		]);
		expect(pushMock).toHaveBeenCalledWith("/mcq?userId=u1");
	});

	it("navigates to /mcq without POST when Cancel is clicked", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" createdByUserId="u1" />);
		await user.click(screen.getByRole("button", { name: /cancel/i }));

		expect(pushMock).toHaveBeenCalledWith("/mcq?userId=u1");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("shows a validation error from the API and does not navigate", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(400, { error: "A question must have between 2 and 6 choices" }) as Response,
		);

		render(<McqForm mode="create" createdByUserId="u1" />);
		await fillCreateForm(user);
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toBe(
				"A question must have between 2 and 6 choices",
			);
		});
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("shows an error and does not POST when createdByUserId is missing", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await fillCreateForm(user);
		await user.click(screen.getByRole("button", { name: /save/i }));

		expect(screen.getByRole("alert").textContent).toMatch(/created by/i);
		expect(fetch).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
	});
});

describe("McqForm edit", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("loads GET by id into Name, Question, and choices", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { mcq: loadedMcq }) as Response);

		render(<McqForm mode="edit" mcqId="q1" />);

		await waitFor(() => {
			expect(screen.getByLabelText(/^name$/i)).toHaveProperty("value", "Photosynthesis");
		});
		expect(screen.getByLabelText(/^question$/i)).toHaveProperty(
			"value",
			"What gas do plants produce?",
		);
		expect(screen.getByLabelText(/^choice 1$/i)).toHaveProperty("value", "Oxygen");
		expect(screen.getByLabelText(/^choice 2$/i)).toHaveProperty("value", "Nitrogen");
		expect(fetch).toHaveBeenCalledWith("/api/mcqs/q1");
	});

	it("PUTs name, question, and choices without createdByUserId and navigates on 200", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs/q1") {
				return jsonResponse(200, { mcq: loadedMcq }) as Response;
			}
			if (method === "PUT" && url === "/api/mcqs/q1") {
				return jsonResponse(200, { mcq: loadedMcq }) as Response;
			}
			return jsonResponse(500, { error: "unexpected" }) as Response;
		});

		render(<McqForm mode="edit" mcqId="q1" />);
		await waitFor(() => screen.getByDisplayValue("Photosynthesis"));

		await user.clear(screen.getByLabelText(/^name$/i));
		await user.type(screen.getByLabelText(/^name$/i), "Respiration");
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			const putCall = vi.mocked(fetch).mock.calls.find((call) => {
				const [, init] = call as [string, RequestInit];
				return init?.method === "PUT";
			});
			expect(putCall).toBeTruthy();
		});

		const putCall = vi.mocked(fetch).mock.calls.find((call) => {
			const [, init] = call as [string, RequestInit];
			return init?.method === "PUT";
		}) as [string, RequestInit];
		const body = JSON.parse(String(putCall[1].body)) as Record<string, unknown>;

		expect(putCall[0]).toBe("/api/mcqs/q1");
		expect(body.name).toBe("Respiration");
		expect(body.question).toBe("What gas do plants produce?");
		expect(body).not.toHaveProperty("createdByUserId");
		expect(body.choices).toEqual([
			{ id: "c1", body: "Oxygen", isCorrect: true, position: 1 },
			{ id: "c2", body: "Nitrogen", isCorrect: false, position: 2 },
		]);
		expect(pushMock).toHaveBeenCalledWith("/mcq");
	});
});
