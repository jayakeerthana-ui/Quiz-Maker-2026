import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/password";
import { UserConflictError } from "@/lib/services/user-service";
import { POST } from "./handler";

const { createUserMock } = vi.hoisted(() => ({
	createUserMock: vi.fn(),
}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: createUserMock,
	};
});

const adaRecord = {
	id: "a1b2c3d4e5f6a1b2",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	passwordHash: "should-not-leak",
	createdAt: "2026-09-01 12:00:00",
	updatedAt: "2026-09-01 12:00:00",
};

function registerRequest(body: unknown) {
	return new Request("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function readJson(response: Response) {
	return (await response.json()) as {
		error?: string;
		user?: Record<string, unknown>;
	};
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with a public profile that includes username and email and omits the password hash", async () => {
		createUserMock.mockResolvedValue(adaRecord);

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: "client-hashed-password",
			}),
		);
		const body = await readJson(response);

		expect(response.status).toBe(201);
		expect(body.user).toMatchObject({
			id: adaRecord.id,
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
		expect(body.user).not.toHaveProperty("passwordHash");
		expect(JSON.stringify(body)).not.toContain("should-not-leak");
	});

	it("returns 400 when required fields are missing or email is not a valid email", async () => {
		const missing = await POST(registerRequest({ username: "ada" }));
		expect(missing.status).toBe(400);
		expect((await readJson(missing)).error).toEqual(expect.any(String));
		expect(createUserMock).not.toHaveBeenCalled();

		const invalidEmail = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "not-an-email",
				password: "client-hashed-password",
			}),
		);
		expect(invalidEmail.status).toBe(400);
		expect((await readJson(invalidEmail)).error).toEqual(expect.any(String));
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 409 when the username is taken", async () => {
		createUserMock.mockRejectedValue(new UserConflictError("username"));

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: "client-hashed-password",
			}),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Username is already taken" });
	});

	it("returns 409 when the email is taken", async () => {
		createUserMock.mockRejectedValue(new UserConflictError("email"));

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: "client-hashed-password",
			}),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Email is already taken" });
	});

	it("hashes the incoming password before createUser is called", async () => {
		createUserMock.mockResolvedValue(adaRecord);
		const incomingPassword = "client-hashed-password";
		const expectedHash = await sha256Hex(incomingPassword);

		await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				password: incomingPassword,
			}),
		);

		expect(createUserMock).toHaveBeenCalledTimes(1);
		expect(createUserMock).toHaveBeenCalledWith(
			expect.objectContaining({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@school.edu",
				passwordHash: expectedHash,
			}),
		);
		expect(createUserMock.mock.calls[0]?.[0].passwordHash).not.toBe(incomingPassword);
	});
});
