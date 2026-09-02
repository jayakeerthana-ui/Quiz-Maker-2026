import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/password";
import { LoginForm } from "@/components/login-form";

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

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders exactly two fields: username or email, then password", () => {
		render(<LoginForm />);

		const identifier = screen.getByLabelText(/username or email/i);
		const password = screen.getByLabelText(/^password$/i);

		expect(screen.getAllByRole("textbox")).toHaveLength(1);
		expect(screen.queryByLabelText(/^email$/i)).toBeNull();
		expect(
			identifier.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("hashes the password before fetch and navigates to /mcq on 200", async () => {
		const user = userEvent.setup();
		const plaintext = "secret123";
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { user: { username: "ada" } }) as Response);

		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username or email/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), plaintext);
		await user.click(screen.getByRole("button", { name: /login/i }));

		await waitFor(() => expect(fetch).toHaveBeenCalled());

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as { identifier: string; password: string };

		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({ method: "POST" }),
		);
		expect(body.identifier).toBe("ada");
		expect(body.password).toBe(await sha256Hex(plaintext));
		expect(body.password).not.toBe(plaintext);
		expect(pushMock).toHaveBeenCalledWith("/mcq");
	});

	it("shows the generic 401 message and does not navigate", async () => {
		const user = userEvent.setup();
		const message = "Invalid username/email or password";
		vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: message }) as Response);

		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username or email/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), "secret123");
		await user.click(screen.getByRole("button", { name: /login/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toBe(message);
		});
		expect(pushMock).not.toHaveBeenCalled();
	});
});
