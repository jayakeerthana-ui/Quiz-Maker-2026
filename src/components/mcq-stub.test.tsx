import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqStub } from "@/components/mcq-stub";

const { pushMock } = vi.hoisted(() => ({
	pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: pushMock }),
}));

describe("McqStub", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows placeholder copy for the shared test-bank and no MCQ CRUD", () => {
		render(<McqStub />);

		expect(screen.getByText(/shared test-bank/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /create question|add mcq|save question/i })).toBeNull();
	});

	it("calls POST /api/auth/logout and navigates to /login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		} as Response);

		render(<McqStub />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(fetch).toHaveBeenCalled());
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/logout",
			expect.objectContaining({ method: "POST" }),
		);
		expect(pushMock).toHaveBeenCalledWith("/login");
	});

	it("navigates to /login even if logout fails", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockRejectedValue(new Error("network"));

		render(<McqStub />);
		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
	});
});
