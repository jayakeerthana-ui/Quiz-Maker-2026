import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/password";
import { POST } from "./handler";

const { getUserByLoginIdentifierMock } = vi.hoisted(() => ({
	getUserByLoginIdentifierMock: vi.fn(),
}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		getUserByLoginIdentifier: getUserByLoginIdentifierMock,
	};
});

const genericError = { error: "Invalid username/email or password" };

async function adaWithPassword(clientPassword: string) {
	return {
		id: "a1b2c3d4e5f6a1b2",
		firstName: "Ada",
		lastName: "Lovelace",
		username: "ada",
		email: "ada@school.edu",
		passwordHash: await sha256Hex(clientPassword),
		createdAt: "2026-09-01 12:00:00",
		updatedAt: "2026-09-01 12:00:00",
	};
}

function loginRequest(body: unknown) {
	return new Request("http://localhost/api/auth/login", {
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

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 when the identifier is the username and the hash matches", async () => {
		const password = "client-hashed-password";
		getUserByLoginIdentifierMock.mockResolvedValue(await adaWithPassword(password));

		const response = await POST(loginRequest({ identifier: "ada", password }));
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body.user).toMatchObject({
			username: "ada",
			email: "ada@school.edu",
		});
		expect(getUserByLoginIdentifierMock).toHaveBeenCalledWith("ada");
	});

	it("returns 200 when the identifier is the email and the hash matches", async () => {
		const password = "client-hashed-password";
		getUserByLoginIdentifierMock.mockResolvedValue(await adaWithPassword(password));

		const response = await POST(
			loginRequest({ identifier: "ada@school.edu", password }),
		);
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body.user?.email).toBe("ada@school.edu");
		expect(getUserByLoginIdentifierMock).toHaveBeenCalledWith("ada@school.edu");
	});

	it("returns 400 when identifier or password is missing", async () => {
		const missingIdentifier = await POST(loginRequest({ password: "secret" }));
		expect(missingIdentifier.status).toBe(400);
		expect((await readJson(missingIdentifier)).error).toEqual(expect.any(String));

		const missingPassword = await POST(loginRequest({ identifier: "ada" }));
		expect(missingPassword.status).toBe(400);
		expect((await readJson(missingPassword)).error).toEqual(expect.any(String));
		expect(getUserByLoginIdentifierMock).not.toHaveBeenCalled();
	});

	it("returns 401 with the same generic message for an unknown identifier or a wrong password", async () => {
		getUserByLoginIdentifierMock.mockResolvedValue(null);
		const unknown = await POST(loginRequest({ identifier: "nobody", password: "hash" }));
		expect(unknown.status).toBe(401);
		expect(await unknown.json()).toEqual(genericError);

		const password = "correct-hash";
		getUserByLoginIdentifierMock.mockResolvedValue(await adaWithPassword(password));
		const wrong = await POST(loginRequest({ identifier: "ada", password: "wrong-hash" }));
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual(genericError);
	});

	it("never includes passwordHash in the response", async () => {
		const password = "client-hashed-password";
		getUserByLoginIdentifierMock.mockResolvedValue(await adaWithPassword(password));

		const response = await POST(loginRequest({ identifier: "ada", password }));
		const body = await readJson(response);

		expect(body.user).not.toHaveProperty("passwordHash");
		expect(JSON.stringify(body)).not.toMatch(/passwordHash/i);
	});
});
