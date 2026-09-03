import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/password";
import { SignupForm } from "@/components/signup-form";

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

async function fillValidRegistration(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/first name/i), "Ada");
	await user.type(screen.getByLabelText(/last name/i), "Lovelace");
	await user.type(screen.getByLabelText(/^username$/i), "ada");
	await user.type(screen.getByLabelText(/^email$/i), "ada@school.edu");
	await user.type(screen.getByLabelText(/^password$/i), "secret123");
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("requires both username and email", () => {
		render(<SignupForm />);

		expect((screen.getByLabelText(/^username$/i) as HTMLInputElement).required).toBe(true);
		expect((screen.getByLabelText(/^email$/i) as HTMLInputElement).required).toBe(true);
	});

	it("hashes the password before fetch and navigates to /login on 201", async () => {
		const user = userEvent.setup();
		const plaintext = "secret123";
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(201, { user: { username: "ada", email: "ada@school.edu" } }) as Response,
		);

		render(<SignupForm />);
		await fillValidRegistration(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(fetch).toHaveBeenCalled());

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body)) as {
			firstName: string;
			lastName: string;
			username: string;
			email: string;
			password: string;
		};

		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/register",
			expect.objectContaining({ method: "POST" }),
		);
		expect(body).toMatchObject({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
		expect(body.password).toBe(await sha256Hex(plaintext));
		expect(body.password).not.toBe(plaintext);
		expect(pushMock).toHaveBeenCalledWith("/login");
		expect(pushMock).not.toHaveBeenCalledWith("/mcq");
	});

	it("surfaces a 409 duplicate username and does not navigate", async () => {
		const user = userEvent.setup();
		const message = "Username is already taken";
		vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { error: message }) as Response);

		render(<SignupForm />);
		await fillValidRegistration(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toBe(message);
		});
		expect(pushMock).not.toHaveBeenCalled();
	});

	it("surfaces a 409 duplicate email and does not navigate", async () => {
		const user = userEvent.setup();
		const message = "Email is already taken";
		vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { error: message }) as Response);

		render(<SignupForm />);
		await fillValidRegistration(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toBe(message);
		});
		expect(pushMock).not.toHaveBeenCalled();
	});
});
